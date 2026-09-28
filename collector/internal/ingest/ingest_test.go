package ingest

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

const vectorBody = `{"collector":{"name":"skylark-collector","version":"0.1.0","run_id":"00000000-0000-4000-8000-000000000000","os":"linux","arch":"amd64"},"server":null,"events":[]}`

func TestSignatureVector(t *testing.T) {
	signature := Sign("skylark-test-secret", 1790000000, []byte(vectorBody))
	if signature != "sha256=6fcb705dacb5af3277d5b6d3a5e0a606f549c6ca663483ac381943146aa84028" {
		t.Fatalf("signature %s", signature)
	}
	if !Verify("skylark-test-secret", 1790000000, []byte(vectorBody), signature) {
		t.Fatal("verify")
	}
	if Verify("skylark-test-secret", 1790000001, []byte(vectorBody), signature) {
		t.Fatal("the timestamp is part of the signature")
	}
}

func TestEnvelopeMatchesTheVector(t *testing.T) {
	prefix, err := Envelope(CollectorInfo{Name: "skylark-collector", Version: "0.1.0", RunID: "00000000-0000-4000-8000-000000000000", OS: "linux", Arch: "amd64"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	batch := Build(prefix, nil, 0, 0)
	if string(batch.Body) != vectorBody {
		t.Fatalf("body %s", batch.Body)
	}
}

func testItem(seq int, eventType string, size int) Item {
	padding := strings.Repeat("x", size)
	raw := fmt.Sprintf(`{"id":"00000000-0000-4000-8000-%012d","seq":%d,"run_id":"11111111-1111-4111-8111-111111111111","ts":"2026-09-27T20:00:00.000Z","type":"%s","data":{"pad":"%s"}}`, seq, seq, eventType, padding)
	item, err := ItemFromRaw([]byte(raw))
	if err != nil {
		panic(err)
	}
	return item
}

func TestBuildRespectsCountAndSize(t *testing.T) {
	prefix, _ := Envelope(CollectorInfo{Name: "c", Version: "v", RunID: "r"}, nil)
	var items []Item
	for i := 1; i <= 700; i++ {
		items = append(items, testItem(i, "world.snapshot", 10))
	}
	batch := Build(prefix, items, 0, 0)
	if len(batch.Items) != MaxBatchEvents {
		t.Fatalf("events %d", len(batch.Items))
	}
	var parsed struct {
		Events []json.RawMessage `json:"events"`
	}
	if err := json.Unmarshal(batch.Body, &parsed); err != nil || len(parsed.Events) != MaxBatchEvents {
		t.Fatalf("body is not a valid batch: %v", err)
	}
	items = items[:0]
	for i := 1; i <= 10; i++ {
		items = append(items, testItem(i, "world.snapshot", 100*1024))
	}
	batch = Build(prefix, items, 0, 0)
	if len(batch.Items) != 5 || len(batch.Body) > MaxBatchBytes {
		t.Fatalf("items %d body %d", len(batch.Items), len(batch.Body))
	}
	huge := []Item{testItem(1, "world.snapshot", 600*1024)}
	if Fits(prefix, huge[0].Raw, 0) {
		t.Fatal("an event over the batch limit does not fit")
	}
}

func TestJournalReplaysUnacknowledgedEvents(t *testing.T) {
	dir := t.TempDir()
	journal, pending, err := OpenJournal(dir)
	if err != nil || len(pending) != 0 {
		t.Fatalf("open %v %d", err, len(pending))
	}
	var items []Item
	for i := 1; i <= 5; i++ {
		items = append(items, testItem(i, "chat.message", 5))
		if err := journal.Append(items[i-1]); err != nil {
			t.Fatal(err)
		}
	}
	if err := journal.Acknowledge(items[2].ID, items[3:]); err != nil {
		t.Fatal(err)
	}
	journal.Close()
	file, err := os.OpenFile(filepath.Join(dir, JournalFileName), os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		t.Fatal(err)
	}
	file.WriteString(`{"id":"broken","seq":`)
	file.Close()
	journal, pending, err = OpenJournal(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(pending) != 2 || pending[0].Seq != 4 || pending[1].Seq != 5 {
		t.Fatalf("pending %+v", pending)
	}
	if err := journal.Acknowledge(pending[1].ID, nil); err != nil {
		t.Fatal(err)
	}
	journal.Close()
	journal, pending, err = OpenJournal(dir)
	if err != nil || len(pending) != 0 {
		t.Fatalf("after a full acknowledgement nothing is replayed: %v %d", err, len(pending))
	}
	journal.Close()
	data, _ := os.ReadFile(filepath.Join(dir, JournalFileName))
	if len(data) != 0 {
		t.Fatalf("the journal is emptied once everything is acknowledged: %q", data)
	}
}

type fakeSite struct {
	mu       sync.Mutex
	secret   string
	batches  [][]byte
	statuses []int
	actions  string
	handler  func(body []byte) int
}

func (s *fakeSite) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(r.Body)
	timestamp, _ := strconv.ParseInt(r.Header.Get(TimestampHeader), 10, 64)
	if !Verify(s.secret, timestamp, body, r.Header.Get(SignatureHeader)) || time.Since(time.Unix(timestamp, 0)) > 5*time.Minute {
		w.WriteHeader(http.StatusUnauthorized)
		fmt.Fprint(w, `{"error":{"code":"unauthorized","message":"bad signature"}}`)
		return
	}
	s.mu.Lock()
	status := http.StatusOK
	if s.handler != nil {
		status = s.handler(body)
	}
	s.statuses = append(s.statuses, status)
	if status == http.StatusOK {
		s.batches = append(s.batches, body)
	}
	actions := s.actions
	s.mu.Unlock()
	w.WriteHeader(status)
	if status == http.StatusOK {
		if actions == "" {
			actions = "[]"
		}
		fmt.Fprintf(w, `{"accepted":1,"duplicates":0,"invalid":0,"last_seq":null,"actions":%s}`, actions)
	}
}

func (s *fakeSite) eventCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	total := 0
	for _, body := range s.batches {
		var batch struct {
			Events []json.RawMessage `json:"events"`
		}
		json.Unmarshal(body, &batch)
		total += len(batch.Events)
	}
	return total
}

func newPipeline(t *testing.T, site *fakeSite, dir string) (*Pipeline, *Journal, *httptest.Server) {
	t.Helper()
	server := httptest.NewServer(site)
	t.Cleanup(server.Close)
	journal, replay, err := OpenJournal(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { journal.Close() })
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	pipeline := NewPipeline(Options{URL: server.URL + "/api/ingest", Secret: site.secret, FlushInterval: 20 * time.Millisecond}, journal, replay, func() (CollectorInfo, any) {
		return CollectorInfo{Name: "skylark-collector", Version: "test", RunID: "11111111-1111-4111-8111-111111111111", OS: "linux", Arch: "amd64"}, nil
	}, logger)
	return pipeline, journal, server
}

func TestPipelineDeliversSignedBatchesAndActions(t *testing.T) {
	site := &fakeSite{secret: "s3cret", actions: `[{"id":7,"kind":"announce","message":"hi","user_id":null,"waittime_s":null}]`}
	dir := t.TempDir()
	pipeline, journal, _ := newPipeline(t, site, dir)
	for i := 1; i <= 1200; i++ {
		if err := pipeline.Enqueue(testItem(i, "chat.message", 20).Raw); err != nil {
			t.Fatal(err)
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if !pipeline.Flush(ctx) {
		t.Fatal("flush did not finish")
	}
	if site.eventCount() != 1200 || len(site.batches) != 3 {
		t.Fatalf("events %d batches %d", site.eventCount(), len(site.batches))
	}
	select {
	case actions := <-pipeline.Actions():
		if len(actions) != 1 || actions[0].ID != 7 || actions[0].Kind != ActionAnnounce || *actions[0].Message != "hi" {
			t.Fatalf("actions %+v", actions)
		}
	default:
		t.Fatal("expected the actions of the response")
	}
	journal.Close()
	reopened, replay, err := OpenJournal(dir)
	if err != nil || len(replay) != 0 {
		t.Fatalf("delivered events are not replayed: %v %d", err, len(replay))
	}
	reopened.Close()
}

func TestFlushWhileTheSenderRunsDeliversEachEventOnce(t *testing.T) {
	site := &fakeSite{secret: "s3cret"}
	pipeline, _, _ := newPipeline(t, site, t.TempDir())
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		pipeline.Run(ctx)
		close(done)
	}()
	for round := 0; round < 20; round++ {
		pipeline.Enqueue(testItem(round+1, "chat.message", 5).Raw)
		pipeline.Wake()
		flushCtx, flushCancel := context.WithTimeout(context.Background(), 5*time.Second)
		pipeline.Flush(flushCtx)
		flushCancel()
	}
	cancel()
	<-done
	seen := map[string]int{}
	site.mu.Lock()
	for _, body := range site.batches {
		var batch struct {
			Events []struct {
				ID string `json:"id"`
			} `json:"events"`
		}
		json.Unmarshal(body, &batch)
		for _, item := range batch.Events {
			seen[item.ID]++
		}
	}
	site.mu.Unlock()
	if len(seen) != 20 {
		t.Fatalf("delivered %d distinct events", len(seen))
	}
	for id, count := range seen {
		if count != 1 {
			t.Fatalf("event %s was sent %d times", id, count)
		}
	}
}

func TestPipelineSplitsTooLargeBatchesAndSetsAsideSingleEvents(t *testing.T) {
	site := &fakeSite{secret: "s3cret"}
	site.handler = func(body []byte) int {
		if bytes.Count(body, []byte(`"type":"chat.message"`)) > 100 || bytes.Contains(body, []byte("poison")) {
			return http.StatusRequestEntityTooLarge
		}
		return http.StatusOK
	}
	dir := t.TempDir()
	pipeline, _, _ := newPipeline(t, site, dir)
	for i := 1; i <= 300; i++ {
		pipeline.Enqueue(testItem(i, "chat.message", 10).Raw)
	}
	poison := strings.Replace(string(testItem(301, "chat.message", 10).Raw), `"pad":"xxxxxxxxxx"`, `"pad":"poison"`, 1)
	pipeline.Enqueue([]byte(poison))
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if !pipeline.Flush(ctx) {
		t.Fatal("flush did not finish")
	}
	if site.eventCount() != 300 {
		t.Fatalf("events %d", site.eventCount())
	}
	rejected, err := os.ReadFile(filepath.Join(dir, RejectedFileName))
	if err != nil || !strings.Contains(string(rejected), "poison") || !strings.Contains(string(rejected), "payload_too_large") {
		t.Fatalf("rejected %s %v", rejected, err)
	}
}

func TestPipelineBacksOffOnABadSecret(t *testing.T) {
	site := &fakeSite{secret: "right"}
	server := httptest.NewServer(site)
	defer server.Close()
	journal, _, err := OpenJournal(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { journal.Close() })
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	pipeline := NewPipeline(Options{URL: server.URL, Secret: "wrong"}, journal, nil, func() (CollectorInfo, any) {
		return CollectorInfo{Name: "c", Version: "v", RunID: "r"}, nil
	}, logger)
	pipeline.Enqueue(testItem(1, "chat.message", 1).Raw)
	if pipeline.sendOnce(context.Background()) {
		t.Fatal("a refused batch is not accepted")
	}
	stats := pipeline.Stats()
	if !stats.UnauthorizedSeen || stats.Depth != 1 {
		t.Fatalf("stats %+v", stats)
	}
	if wait := time.Until(pipeline.nextAttempt); wait < 20*time.Second {
		t.Fatalf("a bad secret backs off for a long time, got %s", wait)
	}
}

func TestPipelineShedsSnapshotsFirst(t *testing.T) {
	journal, _, err := OpenJournal(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { journal.Close() })
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	pipeline := NewPipeline(Options{URL: "http://127.0.0.1:1", MaxPendingEvents: 100}, journal, nil, func() (CollectorInfo, any) {
		return CollectorInfo{Name: "c", Version: "v", RunID: "r"}, nil
	}, logger)
	for i := 1; i <= 101; i++ {
		eventType := "world.snapshot"
		if i%10 == 0 {
			eventType = "chat.message"
		}
		pipeline.Enqueue(testItem(i, eventType, 1).Raw)
	}
	stats := pipeline.Stats()
	if stats.Depth > 75 || stats.Dropped == 0 {
		t.Fatalf("stats %+v", stats)
	}
	chats := 0
	for _, item := range pipeline.pending {
		if item.Type == "chat.message" {
			chats++
		}
	}
	if chats != 10 {
		t.Fatalf("chat messages are kept while snapshots can go, kept %d", chats)
	}
}

func TestClassifyAndDelay(t *testing.T) {
	cases := map[int]Outcome{200: Accepted, 401: Unauthorized, 403: Unauthorized, 413: TooLarge, 422: Unprocessable, 400: Unprocessable, 429: RateLimited, 503: Retryable, 500: Retryable}
	for status, want := range cases {
		if got := Classify(status, false); got != want {
			t.Errorf("%d: got %s want %s", status, got, want)
		}
	}
	if Classify(0, true) != Retryable {
		t.Error("a network error is retried")
	}
	if delay := Delay(Retryable, 10, 0); delay > 72*time.Second {
		t.Errorf("retries are capped near a minute, got %s", delay)
	}
	if delay := Delay(RateLimited, 1, 42*time.Second); delay != 42*time.Second {
		t.Errorf("Retry-After is honoured, got %s", delay)
	}
	if RetryAfter("7", time.Now()) != 7*time.Second {
		t.Error("Retry-After seconds")
	}
}

func TestParseResult(t *testing.T) {
	result, err := ParseResult([]byte(`{"accepted":3,"duplicates":1,"invalid":0,"last_seq":12,"actions":[{"id":4,"kind":"shutdown","message":"bye","user_id":null,"waittime_s":30},{"id":5,"kind":"kick","message":null,"user_id":"steam_76561190000000101","waittime_s":null}]}`))
	if err != nil {
		t.Fatal(err)
	}
	if result.Accepted != 3 || *result.LastSeq != 12 || len(result.Actions) != 2 || *result.Actions[0].WaittimeS != 30 || *result.Actions[1].UserID != "steam_76561190000000101" {
		t.Fatalf("result %+v", result)
	}
}
