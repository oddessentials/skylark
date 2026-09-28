package collector

import (
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

	"github.com/oddessentials/skylark/collector/internal/config"
	"github.com/oddessentials/skylark/collector/internal/contract"
	"github.com/oddessentials/skylark/collector/internal/ingest"
	"github.com/oddessentials/skylark/collector/internal/palrest"
	"github.com/oddessentials/skylark/collector/internal/serverlog"
)

const adminPassword = "rest-secret"

type fakeServer struct {
	mu          sync.Mutex
	info        string
	settings    string
	metrics     string
	players     []palrest.Player
	gameData    *palrest.GameData
	gameDataOff bool
	down        bool
	posts       []string
	onShutdown  func()
}

func newFakeServer(t *testing.T) *fakeServer {
	t.Helper()
	read := func(name string) string {
		data, err := os.ReadFile(filepath.Join("testdata", name))
		if err != nil {
			t.Fatal(err)
		}
		return string(data)
	}
	return &fakeServer{info: read("info.json"), settings: read("settings.json"), metrics: read("metrics.json"), players: []palrest.Player{}}
}

func (s *fakeServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.down {
		hijacker, ok := w.(http.Hijacker)
		if ok {
			conn, _, err := hijacker.Hijack()
			if err == nil {
				conn.Close()
				return
			}
		}
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}
	user, password, ok := r.BasicAuth()
	if !ok || !strings.EqualFold(user, "admin") || password != adminPassword {
		w.WriteHeader(http.StatusUnauthorized)
		fmt.Fprint(w, "Unauthorized")
		return
	}
	if r.Method == http.MethodPost {
		body, _ := io.ReadAll(r.Body)
		s.posts = append(s.posts, r.URL.Path+" "+string(body))
		if strings.HasSuffix(r.URL.Path, "/shutdown") && s.onShutdown != nil {
			go s.onShutdown()
		}
		w.WriteHeader(http.StatusOK)
		return
	}
	switch strings.TrimPrefix(r.URL.Path, "/v1/api") {
	case "/info":
		fmt.Fprint(w, s.info)
	case "/settings":
		w.Header().Set("Content-Type", "text/plain;charset=utf-8")
		fmt.Fprint(w, s.settings)
	case "/metrics":
		fmt.Fprint(w, s.metrics)
	case "/players":
		json.NewEncoder(w).Encode(map[string]any{"players": s.players})
	case "/game-data":
		if s.gameDataOff || s.gameData == nil {
			w.Header().Set("Content-Type", "text/plain;charset=utf-8")
			w.WriteHeader(http.StatusNotFound)
			fmt.Fprint(w, "PalGameDataBridge GameData API is not enabled")
			return
		}
		json.NewEncoder(w).Encode(s.gameData)
	default:
		w.WriteHeader(http.StatusNotFound)
	}
}

func (s *fakeServer) set(update func(s *fakeServer)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	update(s)
}

func (s *fakeServer) postCalls() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]string(nil), s.posts...)
}

type fakeSite struct {
	mu      sync.Mutex
	secret  string
	events  []json.RawMessage
	bodies  [][]byte
	actions []ingest.Action
	status  int
	t       *testing.T
}

func (s *fakeSite) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(r.Body)
	timestamp, _ := strconv.ParseInt(r.Header.Get(ingest.TimestampHeader), 10, 64)
	if !ingest.Verify(s.secret, timestamp, body, r.Header.Get(ingest.SignatureHeader)) {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.status != 0 {
		w.WriteHeader(s.status)
		return
	}
	var batch struct {
		Events []json.RawMessage `json:"events"`
	}
	if err := json.Unmarshal(body, &batch); err != nil {
		w.WriteHeader(http.StatusUnprocessableEntity)
		return
	}
	s.bodies = append(s.bodies, body)
	s.events = append(s.events, batch.Events...)
	actions, _ := json.Marshal(s.actions)
	if len(s.actions) == 0 {
		actions = []byte("[]")
	}
	fmt.Fprintf(w, `{"accepted":%d,"duplicates":0,"invalid":0,"last_seq":null,"actions":%s}`, len(batch.Events), actions)
}

type decoded struct {
	ID    string          `json:"id"`
	Seq   int64           `json:"seq"`
	RunID string          `json:"run_id"`
	TS    string          `json:"ts"`
	Type  string          `json:"type"`
	Data  json.RawMessage `json:"data"`
	Raw   json.RawMessage `json:"-"`
}

func (s *fakeSite) received() []decoded {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]decoded, 0, len(s.events))
	for _, raw := range s.events {
		var item decoded
		json.Unmarshal(raw, &item)
		item.Raw = raw
		out = append(out, item)
	}
	return out
}

func (s *fakeSite) has(eventType string, match func(data string) bool) bool {
	for _, item := range s.received() {
		if item.Type == eventType && (match == nil || match(string(item.Data))) {
			return true
		}
	}
	return false
}

type chanSource struct {
	lines chan string
}

func (s *chanSource) Name() string {
	return "test"
}

func (s *chanSource) Run(ctx context.Context, sink serverlog.Sink) error {
	sink.State(serverlog.StateConnected, nil)
	for {
		select {
		case <-ctx.Done():
			return nil
		case line := <-s.lines:
			sink.Line(serverlog.Line{Text: serverlog.Clean(line), ReceivedAt: time.Now()})
		}
	}
}

func testConfig(t *testing.T, rest, site, source string) *config.Config {
	t.Helper()
	enabled := true
	return &config.Config{
		Site:     config.Site{URL: site, Secret: "site-secret"},
		Palworld: config.Palworld{RestURL: rest, AdminPassword: adminPassword},
		Logs:     config.Logs{Source: source, Timezone: "UTC"},
		Launch:   config.Launch{ShutdownWait: time.Second, ShutdownMessage: "bye", EnableGameData: &enabled},
		Intervals: config.Intervals{
			Players:      100 * time.Millisecond,
			Snapshot:     150 * time.Millisecond,
			SnapshotIdle: time.Second,
			Metrics:      300 * time.Millisecond,
			Heartbeat:    400 * time.Millisecond,
			Flush:        50 * time.Millisecond,
		},
		JournalDir: filepath.Join(t.TempDir(), "journal"),
		Location:   time.UTC,
	}
}

func eventually(t *testing.T, what string, condition func() bool) {
	t.Helper()
	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		time.Sleep(25 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", what)
}

func player(level int, hp float64, action string) palrest.Actor {
	return palrest.Actor{
		Type: "Character", InstanceID: playerID + " : A0000006BBBBBBBBCCCCCCCCD0000006", UnitType: "Player", NickName: "Wanderer",
		UserID: userID, Level: level, HP: hp, MaxHP: 500, GuildID: "A0000007BBBBBBBBCCCCCCCCD0000007", GuildName: "Unnamed Guild",
		Class: "BP_Player_Female_C", Action: action, LocationX: -346912, LocationY: 261690, LocationZ: 5000,
	}
}

func palBox() palrest.Actor {
	return palrest.Actor{Type: "PalBox", GuildID: "A0000007BBBBBBBBCCCCCCCCD0000007", GuildName: "Unnamed Guild", Class: "BP_BuildObject_PalBoxV2_C", LocationX: -359369, LocationY: 264023, LocationZ: 7101}
}

func worldWith(actors ...palrest.Actor) *palrest.GameData {
	days := 0
	return &palrest.GameData{Time: "2026-09-27 22:23:24", FPS: 60, AverageFPS: 60, InGameTime: "07:30", InGameDays: &days, ActorData: actors}
}

func validateAll(t *testing.T, site *fakeSite) {
	t.Helper()
	path, err := contract.Find()
	if err != nil {
		t.Fatal(err)
	}
	validator, err := contract.Load(path)
	if err != nil {
		t.Fatal(err)
	}
	site.mu.Lock()
	bodies := append([][]byte(nil), site.bodies...)
	site.mu.Unlock()
	for _, body := range bodies {
		if strings.Contains(string(body), "192.0.2.10") {
			t.Fatalf("an address left the collector: %s", body)
		}
		if err := validator.ValidateJSON("IngestBatch", body); err != nil {
			t.Fatalf("batch: %v", err)
		}
	}
	lastSeq := map[string]int64{}
	for _, item := range site.received() {
		if err := validator.ValidateEvent(item.Raw); err != nil {
			t.Errorf("%v\n%s", err, item.Raw)
		}
		if !strings.HasSuffix(item.TS, "Z") {
			t.Errorf("ts %s is not UTC", item.TS)
		}
		if item.Seq <= lastSeq[item.RunID] {
			t.Errorf("seq %d after %d in run %s", item.Seq, lastSeq[item.RunID], item.RunID)
		}
		lastSeq[item.RunID] = item.Seq
	}
}

func start(t *testing.T, cfg *config.Config, source serverlog.Source) (context.CancelFunc, chan error) {
	t.Helper()
	instance, err := New(Options{
		Config:       cfg,
		Logger:       slog.New(slog.NewTextHandler(io.Discard, nil)),
		Stdout:       io.Discard,
		Source:       source,
		RestTimeout:  2 * time.Second,
		StartupWait:  3 * time.Second,
		StopFlush:    5 * time.Second,
		OfflineAfter: 500 * time.Millisecond,
	})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- instance.Run(ctx, nil) }()
	return cancel, done
}

func stop(t *testing.T, cancel context.CancelFunc, done chan error) {
	t.Helper()
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(15 * time.Second):
		t.Fatal("the collector did not stop")
	}
}

func jsonLine(event, extra string) string {
	return `{ 	"timestamp": "2026-09-27 22:19:11", 	"event": "` + event + `", 	"playername": "Wanderer", 	"userid": "` + userID + `", ` + extra + `	"details": [] }`
}

func TestCollectorEndToEnd(t *testing.T) {
	server := newFakeServer(t)
	server.gameData = worldWith(palBox())
	rest := httptest.NewServer(server)
	defer rest.Close()
	site := &fakeSite{secret: "site-secret"}
	ingestServer := httptest.NewServer(site)
	defer ingestServer.Close()
	source := &chanSource{lines: make(chan string, 64)}
	cfg := testConfig(t, rest.URL, ingestServer.URL, config.SourceFile)
	cancel, done := start(t, cfg, source)

	eventually(t, "collector.started with the server and settings", func() bool {
		return site.has("collector.started", func(data string) bool {
			return strings.Contains(data, `"world_guid":"D09CACDB477D6CE562170AA79C524138"`) && strings.Contains(data, `"day_time_speed_rate":1`) && strings.Contains(data, `"gamedata":true`)
		})
	})
	eventually(t, "server.online", func() bool { return site.has("server.online", nil) })
	eventually(t, "a snapshot with the palbox", func() bool {
		return site.has("world.snapshot", func(data string) bool {
			return strings.Contains(data, "BP_BuildObject_PalBoxV2_C") && strings.Contains(data, `"source":"gamedata"`)
		})
	})

	source.lines <- `{ "timestamp": "2026-09-27 22:19:10", "event": "command", "playername": "REST", "userid": "", "details": [ "/v1/api/players", "OK" ] }`
	source.lines <- jsonLine("connect", `"ip": "192.0.2.10", `)
	source.lines <- jsonLine("join", `"playerid": "`+playerID+`", `)
	server.set(func(s *fakeServer) {
		s.players = []palrest.Player{{Name: "Wanderer", AccountName: "wanderer", PlayerID: playerID, UserID: userID, Ping: 20, LocationX: -346912, LocationY: 261690, Level: 2}}
		s.gameData = worldWith(player(2, 500, ""), palBox())
	})
	eventually(t, "the join from the log", func() bool {
		return site.has("player.joined", func(data string) bool { return strings.Contains(data, `"source":"log"`) })
	})
	eventually(t, "a snapshot with the player", func() bool {
		return site.has("world.snapshot", func(data string) bool {
			return strings.Contains(data, `"account_name":"wanderer"`) && strings.Contains(data, `"player_id":"`+playerID+`"`)
		})
	})
	server.set(func(s *fakeServer) { s.gameData = worldWith(player(3, 500, ""), palBox()) })
	eventually(t, "the level up", func() bool {
		return site.has("player.level_up", func(data string) bool { return strings.Contains(data, `"from":2,"to":3`) })
	})
	server.set(func(s *fakeServer) { s.gameData = worldWith(player(3, 0, palrest.ActionDeath), palBox()) })
	eventually(t, "the death", func() bool { return site.has("player.died", nil) })

	source.lines <- `{ "timestamp": "2026-09-27 22:20:00", "event": "chat", "playername": "Wanderer", "userid": "` + userID + `", "details": [ "Global", "hello", "Unnamed Guild" ] }`
	source.lines <- `{ "timestamp": "2026-09-27 22:20:01", "event": "chat", "playername": "SYSTEM", "userid": "", "details": [ "Global", "Server restart soon", "" ] }`
	source.lines <- `{ "timestamp": "2026-09-27 22:20:02", "event": "command", "playername": "RCON", "userid": "127.0.0.1", "details": [ "Save" ] }`
	source.lines <- `[2026-09-27 22:20:03] [LOG] REST accessed endpoint /v1/api/info OK`
	eventually(t, "the chat message", func() bool {
		return site.has("chat.message", func(data string) bool { return strings.Contains(data, `"text":"hello"`) })
	})
	eventually(t, "the RCON command", func() bool { return site.has("admin.command", nil) })

	site.mu.Lock()
	site.actions = []ingest.Action{{ID: 41, Kind: "announce", Message: text("Server restart in 5 minutes")}}
	site.mu.Unlock()
	eventually(t, "the announce to reach the server", func() bool {
		for _, call := range server.postCalls() {
			if strings.Contains(call, "/announce") && strings.Contains(call, "Server restart in 5 minutes") {
				return true
			}
		}
		return false
	})
	eventually(t, "action.completed", func() bool {
		return site.has("action.completed", func(data string) bool { return strings.Contains(data, `"action_id":41`) })
	})
	site.mu.Lock()
	site.actions = nil
	site.mu.Unlock()

	source.lines <- jsonLine("left", "")
	server.set(func(s *fakeServer) {
		s.players = []palrest.Player{}
		s.gameData = worldWith(palBox())
	})
	eventually(t, "the leave", func() bool {
		return site.has("player.left", func(data string) bool { return strings.Contains(data, `"source":"log"`) })
	})
	eventually(t, "a heartbeat", func() bool {
		return site.has("collector.heartbeat", func(data string) bool {
			return strings.Contains(data, `"rest":"ok"`) && strings.Contains(data, `"gamedata":"ok"`) && strings.Contains(data, `"logs":"ok"`)
		})
	})
	eventually(t, "metrics", func() bool { return site.has("server.metrics", nil) })
	stop(t, cancel, done)
	if !site.has("server.offline", func(data string) bool { return strings.Contains(data, "collector_stopping") }) {
		t.Fatal("stopping the collector reports it")
	}
	for _, item := range site.received() {
		if item.Type == "player.joined" && strings.Contains(string(item.Data), `"source":"rest"`) {
			t.Fatalf("joins come from the log while it is live, never from both: %s", item.Data)
		}
		if item.Type == "chat.message" && strings.Contains(string(item.Data), "SYSTEM") {
			t.Fatalf("chat without a user id is skipped: %s", item.Data)
		}
	}
	joins := 0
	deaths := 0
	for _, item := range site.received() {
		switch item.Type {
		case "player.joined":
			joins++
		case "player.died":
			deaths++
		}
	}
	if joins != 1 || deaths != 1 {
		t.Fatalf("joins %d deaths %d", joins, deaths)
	}
	first := site.received()[0]
	if first.Type != "collector.started" || first.Seq != 1 {
		t.Fatalf("collector.started comes first with seq 1, got %s %d", first.Type, first.Seq)
	}
	for _, call := range server.postCalls() {
		if !strings.Contains(call, "/announce") {
			t.Fatalf("unexpected REST call %s", call)
		}
	}
	validateAll(t, site)
}

func TestCollectorRestOnlyAndOutage(t *testing.T) {
	server := newFakeServer(t)
	server.gameDataOff = true
	rest := httptest.NewServer(server)
	defer rest.Close()
	site := &fakeSite{secret: "site-secret"}
	ingestServer := httptest.NewServer(site)
	defer ingestServer.Close()
	cfg := testConfig(t, rest.URL, ingestServer.URL, config.SourceNone)
	cancel, done := start(t, cfg, nil)
	eventually(t, "collector.started without game data", func() bool {
		return site.has("collector.started", func(data string) bool {
			return strings.Contains(data, `"gamedata":false`) && strings.Contains(data, `"logs_source":null`)
		})
	})
	server.set(func(s *fakeServer) {
		s.players = []palrest.Player{{Name: "Wanderer", AccountName: "wanderer", PlayerID: "None", UserID: userID, Ping: 114, Level: 1}}
	})
	eventually(t, "the join from REST", func() bool {
		return site.has("player.joined", func(data string) bool {
			return strings.Contains(data, `"source":"rest"`) && strings.Contains(data, `"player_id":null`)
		})
	})
	eventually(t, "a players-only snapshot", func() bool {
		return site.has("world.snapshot", func(data string) bool {
			return strings.Contains(data, `"source":"rest"`) && strings.Contains(data, `"pals":[]`) && strings.Contains(data, userID)
		})
	})
	eventually(t, "a heartbeat with game data off", func() bool {
		return site.has("collector.heartbeat", func(data string) bool {
			return strings.Contains(data, `"gamedata":"off"`) && strings.Contains(data, `"logs":"off"`)
		})
	})
	server.set(func(s *fakeServer) { s.down = true })
	eventually(t, "server.offline", func() bool {
		return site.has("server.offline", func(data string) bool { return strings.Contains(data, "unreachable") })
	})
	eventually(t, "heartbeats while REST is down", func() bool {
		return site.has("collector.heartbeat", func(data string) bool { return strings.Contains(data, `"rest":"down"`) })
	})
	server.set(func(s *fakeServer) {
		s.down = false
		s.players = []palrest.Player{}
	})
	eventually(t, "server.online again", func() bool {
		count := 0
		for _, item := range site.received() {
			if item.Type == "server.online" {
				count++
			}
		}
		return count == 2
	})
	stop(t, cancel, done)
	validateAll(t, site)
}

func TestCollectorReplaysTheJournalAfterAnOutage(t *testing.T) {
	server := newFakeServer(t)
	server.gameDataOff = true
	rest := httptest.NewServer(server)
	defer rest.Close()
	site := &fakeSite{secret: "site-secret", status: http.StatusServiceUnavailable}
	ingestServer := httptest.NewServer(site)
	defer ingestServer.Close()
	source := &chanSource{lines: make(chan string, 8)}
	cfg := testConfig(t, rest.URL, ingestServer.URL, config.SourceFile)
	instance, err := New(Options{Config: cfg, Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), Source: source, StartupWait: time.Second, StopFlush: 200 * time.Millisecond})
	if err != nil {
		t.Fatal(err)
	}
	firstRun := instance.RunID()
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- instance.Run(ctx, nil) }()
	source.lines <- `{ "timestamp": "2026-09-27 22:20:00", "event": "chat", "playername": "Wanderer", "userid": "` + userID + `", "details": [ "Global", "sent while the site was down", "" ] }`
	time.Sleep(1500 * time.Millisecond)
	stop(t, cancel, done)
	if len(site.received()) != 0 {
		t.Fatal("nothing was accepted while the site was down")
	}
	site.mu.Lock()
	site.status = 0
	site.mu.Unlock()
	cancel, done = start(t, cfg, &chanSource{lines: make(chan string)})
	eventually(t, "the journaled chat message", func() bool {
		for _, item := range site.received() {
			if item.Type == "chat.message" && item.RunID == firstRun && strings.Contains(string(item.Data), "sent while the site was down") {
				return true
			}
		}
		return false
	})
	eventually(t, "the second run starting", func() bool {
		for _, item := range site.received() {
			if item.Type == "collector.started" && item.RunID != firstRun {
				return true
			}
		}
		return false
	})
	stop(t, cancel, done)
	validateAll(t, site)
}

func TestCollectorLaunchModeShutsTheServerDownThroughRest(t *testing.T) {
	if os.Getenv("SKYLARK_FAKE_SERVER") != "" {
		fmt.Println("Running Palworld dedicated server on :8211")
		fmt.Println(`{ "timestamp": "2026-09-27 22:19:11", "event": "connect", "playername": "Wanderer", "userid": "` + userID + `", "ip": "192.0.2.10", "details": [] }`)
		for {
			if _, err := os.Stat(os.Getenv("SKYLARK_FAKE_SERVER")); err == nil {
				fmt.Println("REST API stopped")
				os.Exit(0)
			}
			time.Sleep(50 * time.Millisecond)
		}
	}
	stopFile := filepath.Join(t.TempDir(), "stop")
	server := newFakeServer(t)
	server.gameDataOff = true
	server.onShutdown = func() { os.WriteFile(stopFile, []byte("stop"), 0o644) }
	rest := httptest.NewServer(server)
	defer rest.Close()
	site := &fakeSite{secret: "site-secret"}
	ingestServer := httptest.NewServer(site)
	defer ingestServer.Close()
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	os.Setenv("SKYLARK_FAKE_SERVER", stopFile)
	defer os.Unsetenv("SKYLARK_FAKE_SERVER")
	cfg := testConfig(t, rest.URL, ingestServer.URL, config.SourceLaunch)
	cfg.Launch.Command = executable
	cfg.Launch.Args = []string{"-test.run=TestCollectorLaunchModeShutsTheServerDownThroughRest", "--"}
	cancel, done := start(t, cfg, nil)
	eventually(t, "the connect line through the launched process", func() bool { return site.has("player.connected", nil) })
	eventually(t, "server.online", func() bool { return site.has("server.online", nil) })
	stop(t, cancel, done)
	shutdown := false
	for _, call := range server.postCalls() {
		if strings.HasPrefix(call, "/v1/api/shutdown") && strings.Contains(call, `"waittime":1`) && strings.Contains(call, `"message":"bye"`) {
			shutdown = true
		}
	}
	if !shutdown {
		t.Fatalf("stopping asks the server to save and shut down: %v", server.postCalls())
	}
	if !site.has("server.offline", func(data string) bool { return strings.Contains(data, `"reason":"shutdown"`) }) {
		t.Fatal("the offline reason is shutdown")
	}
	validateAll(t, site)
}
