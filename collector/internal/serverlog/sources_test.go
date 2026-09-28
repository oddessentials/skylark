package serverlog

import (
	"bytes"
	"context"
	"encoding/binary"
	"fmt"
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

type recordingSink struct {
	mu     sync.Mutex
	lines  []Line
	states []State
}

func (s *recordingSink) Line(line Line) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.lines = append(s.lines, line)
}

func (s *recordingSink) State(state State, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.states = append(s.states, state)
}

func (s *recordingSink) texts() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]string, 0, len(s.lines))
	for _, line := range s.lines {
		out = append(out, line.Text)
	}
	return out
}

func (s *recordingSink) hasState(state State) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, seen := range s.states {
		if seen == state {
			return true
		}
	}
	return false
}

func waitFor(t *testing.T, what string, condition func() bool) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", what)
}

func frame(stream byte, payload string) []byte {
	header := make([]byte, 8)
	header[0] = stream
	binary.BigEndian.PutUint32(header[4:], uint32(len(payload)))
	return append(header, payload...)
}

func TestDockerDemultiplexAndTimestamps(t *testing.T) {
	lines := fixtureLines(t, "docker.txt")
	var stream bytes.Buffer
	for i, line := range lines {
		payload := line + "\n"
		if i%3 == 0 && len(payload) > 10 {
			stream.Write(frame(1, payload[:7]))
			stream.Write(frame(1, payload[7:]))
			continue
		}
		stream.Write(frame(byte(1+i%2), payload))
	}
	var stamps []time.Time
	var texts []string
	if err := demultiplex(&stream, func(raw string) {
		stamp, text := splitDockerTimestamp(raw)
		stamps = append(stamps, stamp)
		texts = append(texts, text)
	}); err != nil {
		t.Fatal(err)
	}
	if len(texts) != len(lines) {
		t.Fatalf("got %d lines, want %d", len(texts), len(lines))
	}
	json := 0
	for i, text := range texts {
		if stamps[i].IsZero() {
			t.Fatalf("line %d has no docker timestamp: %q", i, text)
		}
		if kind, _ := Classify(Clean(text)); kind == KindJSON {
			json++
		}
	}
	if json != 9 {
		t.Fatalf("expected 9 JSON lines, got %d", json)
	}
	if stamps[0].Format(time.RFC3339Nano) != "2026-09-28T02:02:48.857175248Z" {
		t.Fatalf("first stamp %s", stamps[0].Format(time.RFC3339Nano))
	}
}

func TestDockerSourceFollowsAFakeEngine(t *testing.T) {
	logs := fixtureLines(t, "docker.txt")
	var sinceSeen []string
	var mu sync.Mutex
	engine := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasSuffix(r.URL.Path, "/containers/palworld/json"):
			fmt.Fprint(w, `{"State":{"Running":true,"StartedAt":"2026-09-28T02:02:48Z"},"Config":{"Tty":false}}`)
		case strings.HasSuffix(r.URL.Path, "/containers/palworld/logs"):
			mu.Lock()
			sinceSeen = append(sinceSeen, r.URL.Query().Get("since"))
			mu.Unlock()
			for _, line := range logs {
				w.Write(frame(1, line+"\n"))
			}
		default:
			http.NotFound(w, r)
		}
	}))
	defer engine.Close()
	cursor := filepath.Join(t.TempDir(), "docker.cursor")
	source := &DockerSource{Host: "tcp://" + strings.TrimPrefix(engine.URL, "http://"), Container: "palworld", CursorPath: cursor}
	sink := &recordingSink{}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		source.Run(ctx, sink)
		close(done)
	}()
	waitFor(t, "the log lines", func() bool { return len(sink.texts()) >= len(logs) })
	waitFor(t, "a reconnect", func() bool {
		mu.Lock()
		defer mu.Unlock()
		return len(sinceSeen) >= 2
	})
	cancel()
	<-done
	if got := len(sink.texts()); got != len(logs) {
		t.Fatalf("a reconnect must not repeat lines already read: got %d lines for %d", got, len(logs))
	}
	mu.Lock()
	defer mu.Unlock()
	last, err := time.Parse(time.RFC3339Nano, "2026-09-28T02:04:16.030667737Z")
	if err != nil {
		t.Fatal(err)
	}
	if want := strconv.FormatInt(last.Unix(), 10) + ".030667737"; sinceSeen[1] != want {
		t.Fatalf("the reconnect should resume from the last timestamp %s, got since=%s", want, sinceSeen[1])
	}
	data, err := os.ReadFile(cursor)
	if err != nil || !strings.Contains(string(data), "2026-09-28T02:04:16.030667737Z") {
		t.Fatalf("cursor %s %v", data, err)
	}
}

func TestFileSourceTailsResumesAndHandlesTruncation(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "server.log")
	cursor := filepath.Join(dir, "file.cursor")
	if err := os.WriteFile(path, []byte("old line before the collector\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	run := func(sink *recordingSink) (context.CancelFunc, chan struct{}) {
		ctx, cancel := context.WithCancel(context.Background())
		done := make(chan struct{})
		go func() {
			(&FileSource{Path: path, CursorPath: cursor, Poll: 10 * time.Millisecond}).Run(ctx, sink)
			close(done)
		}()
		return cancel, done
	}
	appendLine := func(text string) {
		file, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0o644)
		if err != nil {
			t.Fatal(err)
		}
		file.WriteString(text)
		file.Close()
	}
	first := &recordingSink{}
	cancel, done := run(first)
	waitFor(t, "the source to connect", func() bool { return first.hasState(StateConnected) })
	appendLine("{\"event\":\"join\"}\n{\"event\":\"par")
	waitFor(t, "the first line", func() bool { return len(first.texts()) == 1 })
	appendLine("tial\"}\n")
	waitFor(t, "the completed line", func() bool { return len(first.texts()) == 2 })
	cancel()
	<-done
	if got := strings.Join(first.texts(), "|"); got != `{"event":"join"}|{"event":"partial"}` {
		t.Fatalf("got %s", got)
	}
	appendLine("written while stopped\n")
	second := &recordingSink{}
	cancel, done = run(second)
	waitFor(t, "the line written while stopped", func() bool { return len(second.texts()) == 1 })
	if err := os.WriteFile(path, []byte("after truncation\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	waitFor(t, "the line after truncation", func() bool { return len(second.texts()) == 2 })
	cancel()
	<-done
	if got := strings.Join(second.texts(), "|"); got != "written while stopped|after truncation" {
		t.Fatalf("got %s", got)
	}
}

func TestFileSourceReadsAFileCreatedAfterItStarted(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "skylark-events.jsonl")
	sink := &recordingSink{}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		(&FileSource{Path: path, CursorPath: filepath.Join(dir, "events.cursor"), Poll: 10 * time.Millisecond}).Run(ctx, sink)
		close(done)
	}()
	waitFor(t, "the source to wait for the file", func() bool { return sink.hasState(StateDown) })
	if err := os.WriteFile(path, []byte("first\nsecond\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	waitFor(t, "both lines", func() bool { return len(sink.texts()) == 2 })
	cancel()
	<-done
	if got := strings.Join(sink.texts(), "|"); got != "first|second" {
		t.Fatalf("got %s", got)
	}
}

func TestStdinSourceEndsAndMirrorsWithoutRestNoise(t *testing.T) {
	input := strings.NewReader("Running Palworld dedicated server on :8211\n{ \"event\": \"command\", \"playername\": \"REST\", \"details\": [] }\n{ \"event\": \"join\", \"playername\": \"Wanderer\" }\n")
	var mirror bytes.Buffer
	sink := &recordingSink{}
	filter := func(text string) bool { return !strings.Contains(text, `"REST"`) }
	err := (&StdinSource{Reader: input, Mirror: &mirror, MirrorFilter: filter}).Run(context.Background(), sink)
	if err != nil {
		t.Fatal(err)
	}
	if !sink.hasState(StateEnded) || len(sink.texts()) != 3 {
		t.Fatalf("states %v lines %v", sink.states, sink.texts())
	}
	if strings.Contains(mirror.String(), "REST") || !strings.Contains(mirror.String(), "Wanderer") {
		t.Fatalf("mirror %q", mirror.String())
	}
}

func TestPipeProcessDeliversOutputAndExitCode(t *testing.T) {
	if os.Getenv("SKYLARK_HELPER_PROCESS") == "1" {
		fmt.Println("Running Palworld dedicated server on :8211")
		fmt.Fprintln(os.Stderr, `{ "timestamp": "2026-09-27 22:19:11", "event": "connect", "playername": "Wanderer", "userid": "steam_76561190000000101", "details": [] }`)
		os.Exit(3)
	}
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	os.Setenv("SKYLARK_HELPER_PROCESS", "1")
	defer os.Unsetenv("SKYLARK_HELPER_PROCESS")
	process, err := startPipeProcess(LaunchSpec{Command: executable, Args: []string{"-test.run=TestPipeProcessDeliversOutputAndExitCode"}})
	if err != nil {
		t.Fatal(err)
	}
	source := NewLaunchSource(process, nil)
	sink := &recordingSink{}
	source.Run(context.Background(), sink)
	code, _ := source.ExitCode()
	if code != 3 {
		t.Fatalf("exit code %d", code)
	}
	joined := strings.Join(sink.texts(), "\n")
	if !strings.Contains(joined, "Running Palworld") || !strings.Contains(joined, `"event": "connect"`) {
		t.Fatalf("output %q", joined)
	}
	if !sink.hasState(StateEnded) {
		t.Fatal("expected the ended state")
	}
}
