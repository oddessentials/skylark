package collector

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/oddessentials/skylark/collector/internal/event"
	"github.com/oddessentials/skylark/collector/internal/ingest"
	"github.com/oddessentials/skylark/collector/internal/serverlog"
	"github.com/oddessentials/skylark/collector/internal/world"
)

const (
	userID   = "steam_76561190000000101"
	playerID = "5E7A11C0000000000000000000000000"
)

func logRecords(t *testing.T, name string) []serverlog.Record {
	t.Helper()
	file, err := os.Open(filepath.Join("..", "serverlog", "testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	var records []serverlog.Record
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		if kind, found := serverlog.Classify(serverlog.Clean(scanner.Text())); kind == serverlog.KindJSON {
			records = append(records, found...)
		}
	}
	return records
}

func mapAll(mapper *logMapper, records []serverlog.Record) []emission {
	var out []emission
	at := time.Date(2026, 9, 27, 20, 0, 0, 0, time.UTC)
	for _, record := range records {
		out = append(out, mapper.Map(record, at)...)
	}
	return out
}

func types(items []emission) string {
	names := make([]string, 0, len(items))
	for _, item := range items {
		names = append(names, item.Type)
	}
	return strings.Join(names, " ")
}

func encode(t *testing.T, value any) string {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

func TestSessionLogBecomesEvents(t *testing.T) {
	mapper := &logMapper{tracker: world.NewTracker()}
	items := mapAll(mapper, logRecords(t, "session-json.txt"))
	want := "player.connected player.joined chat.message chat.message chat.message chat.message player.left"
	if got := types(items); got != want {
		t.Fatalf("got %s", got)
	}
	connected := encode(t, items[0].Data)
	if strings.Contains(connected, "192.0.2.10") || strings.Contains(connected, `"ip"`) {
		t.Fatalf("addresses stay out unless send_ips is on: %s", connected)
	}
	joined := items[1].Data.(event.PlayerJoinedData)
	if joined.UserID != userID || *joined.PlayerID != playerID || joined.Source != "log" {
		t.Fatalf("joined %+v", joined)
	}
	chat := items[3].Data.(event.ChatMessageData)
	if chat.Channel != "Guild" || chat.Text != "guild message" || *chat.GuildName != "Unnamed Guild" || chat.Name != "Wanderer" {
		t.Fatalf("chat %+v", chat)
	}
	left := items[6].Data.(event.PlayerLeftData)
	if left.PlayerID == nil || *left.PlayerID != playerID {
		t.Fatalf("the leave carries the player id learned at the join: %+v", left)
	}
	mapper = &logMapper{tracker: world.NewTracker(), sendIPs: true}
	items = mapAll(mapper, logRecords(t, "session-json.txt"))
	if !strings.Contains(encode(t, items[0].Data), `"ip":"192.0.2.10"`) {
		t.Fatalf("with send_ips the address is sent: %s", encode(t, items[0].Data))
	}
}

func TestAdminLogBecomesEvents(t *testing.T) {
	mapper := &logMapper{tracker: world.NewTracker()}
	items := mapAll(mapper, logRecords(t, "admin-json.txt"))
	if got := types(items); got != "admin.command player.banned player.unbanned admin.command" {
		t.Fatalf("REST calls are dropped and the rest is kept, got %s", got)
	}
	command := items[0].Data.(event.AdminCommandData)
	if command.Actor != "RCON" || command.UserID != nil || strings.Join(command.Details, " ") != "Info" {
		t.Fatalf("the RCON client address never becomes a user id: %+v", command)
	}
	banned := items[1].Data.(event.ModerationData)
	if banned.UserID != userID || banned.PlayerID == nil || banned.By != "REST" || *banned.Message != "json ban test" {
		t.Fatalf("banned %+v", banned)
	}
	unbanned := items[2].Data.(event.ModerationData)
	if unbanned.Message != nil || unbanned.PlayerID == nil {
		t.Fatalf("unbanned %+v", unbanned)
	}
}

func TestLogEdgeCases(t *testing.T) {
	mapper := &logMapper{tracker: world.NewTracker()}
	at := time.Now()
	system := serverlog.Record{Event: "chat", PlayerName: "SYSTEM", Details: []string{"Global", "The server restarts soon", ""}}
	if items := mapper.Map(system, at); len(items) != 0 {
		t.Fatalf("chat without a user id is skipped: %+v", items)
	}
	long := serverlog.Record{Event: "chat", PlayerName: "Wanderer", UserID: userID, Details: []string{"Say", strings.Repeat("é", 2500), ""}}
	chat := mapper.Map(long, at)[0].Data.(event.ChatMessageData)
	if len([]rune(chat.Text)) != 2000 || chat.GuildName != nil {
		t.Fatalf("chat text is cut to 2000 characters: %d", len([]rune(chat.Text)))
	}
	secret := serverlog.Record{Event: "command", PlayerName: "Wanderer", UserID: userID, Details: []string{"AdminPassword", "hunter2"}}
	command := mapper.Map(secret, at)[0].Data.(event.AdminCommandData)
	if strings.Contains(encode(t, command), "hunter2") || *command.UserID != userID {
		t.Fatalf("the admin password never leaves the collector: %+v", command)
	}
	unknown := serverlog.Record{Event: "ban_failed", PlayerName: "RCON", UserID: "127.0.0.1", IP: "192.0.2.10", Details: []string{"not_an_id", "192.0.2.10"}}
	items := mapper.Map(unknown, at)
	if items[0].Type != "log.ban_failed" || strings.Contains(encode(t, items[0].Data), "192.0.2.10") || strings.Contains(encode(t, items[0].Data), "127.0.0.1") {
		t.Fatalf("unknown events keep their shape without addresses: %s %s", items[0].Type, encode(t, items[0].Data))
	}
	kick := serverlog.Record{Event: "kick", PlayerName: "Admin Wanderer", UserID: "steam_76561190000000102", Details: []string{userID, "spamming"}}
	kicked := mapper.Map(kick, at)[0]
	data := kicked.Data.(event.ModerationData)
	if kicked.Type != "player.kicked" || data.UserID != userID || data.By != "Admin Wanderer" || *data.Message != "spamming" {
		t.Fatalf("kicked %+v", data)
	}
	if items := mapper.Map(serverlog.Record{Event: "join", PlayerName: "Nobody"}, at); len(items) != 0 {
		t.Fatalf("a join without a user id is skipped: %+v", items)
	}
	if got := mapper.Map(serverlog.Record{Event: "Weird Event!"}, at)[0].Type; got != "log.weird_event" {
		t.Fatalf("event names are made safe: %s", got)
	}
}

func TestCuratedSettingsFromTheLiveServer(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("testdata", "settings.json"))
	if err != nil {
		t.Fatal(err)
	}
	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatal(err)
	}
	settings := curateSettings(raw)
	if settings == nil {
		t.Fatal("settings")
	}
	got := encode(t, settings)
	want := `{"day_time_speed_rate":1,"night_time_speed_rate":1,"server_player_max_num":32,"is_pvp":false,"is_hardcore":false,"exp_rate":1,"pal_capture_rate":1,"death_penalty":"Item","guild_player_max_num":20,"base_camp_max_num_in_guild":4}`
	if got != want {
		t.Fatalf("got %s", got)
	}
	if curateSettings(map[string]any{"ExpRate": 2.0}) != nil {
		t.Fatal("settings without the required rates are left out")
	}
}

type fakeRunner struct {
	calls []string
	fail  error
}

func (f *fakeRunner) record(call string) error {
	f.calls = append(f.calls, call)
	return f.fail
}

func (f *fakeRunner) Announce(ctx context.Context, message string) error {
	return f.record("announce " + message)
}

func (f *fakeRunner) Kick(ctx context.Context, userID, message string) error {
	return f.record("kick " + userID + " " + message)
}

func (f *fakeRunner) Ban(ctx context.Context, userID, message string) error {
	return f.record("ban " + userID + " " + message)
}

func (f *fakeRunner) Unban(ctx context.Context, userID string) error {
	return f.record("unban " + userID)
}

func (f *fakeRunner) Save(ctx context.Context) error {
	return f.record("save")
}

func (f *fakeRunner) Shutdown(ctx context.Context, waitSeconds int, message string) error {
	return f.record("shutdown " + message)
}

func text(value string) *string {
	return &value
}

func TestActionsRunOnceAcrossRestarts(t *testing.T) {
	dir := t.TempDir()
	log, err := OpenActionLog(dir)
	if err != nil {
		t.Fatal(err)
	}
	runner := &fakeRunner{}
	incoming := make(chan []ingest.Action, 4)
	results := make(chan actionResult, 16)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	shutdowns := 0
	go func() {
		runActions(ctx, runner, log, incoming, results, func() { shutdowns++ })
		close(done)
	}()
	wait := 5
	batch := []ingest.Action{
		{ID: 12, Kind: "shutdown", Message: text("maintenance"), WaittimeS: &wait},
		{ID: 11, Kind: "announce", Message: text("restart in 5 seconds")},
		{ID: 13, Kind: "kick"},
	}
	incoming <- batch
	incoming <- batch
	var got []actionResult
	for len(got) < 3 {
		select {
		case result := <-results:
			got = append(got, result)
		case <-time.After(5 * time.Second):
			t.Fatalf("results %+v", got)
		}
	}
	time.Sleep(100 * time.Millisecond)
	cancel()
	<-done
	if len(results) != 0 {
		t.Fatal("repeated actions are not run again")
	}
	if strings.Join(runner.calls, "|") != "announce restart in 5 seconds|shutdown maintenance" || shutdowns != 1 {
		t.Fatalf("calls %q shutdowns %d", runner.calls, shutdowns)
	}
	if got[2].Action.ID != 13 || got[2].Err == nil || !strings.Contains(got[2].Err.Error(), "user_id") {
		t.Fatalf("an invalid action fails without a call: %+v", got[2])
	}
	reopened, err := OpenActionLog(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []int64{11, 12, 13} {
		if !reopened.Known(id) {
			t.Fatalf("action %d is remembered after a restart", id)
		}
	}
	reopened.Record(14, "save", actionStarted)
	again, _ := OpenActionLog(dir)
	interrupted := again.Interrupted()
	if len(interrupted) != 1 || interrupted[0].ID != 14 {
		t.Fatalf("an action that was running during a crash is found: %+v", interrupted)
	}
}

func TestExecuteActionValidation(t *testing.T) {
	runner := &fakeRunner{fail: errors.New("POST /kick: HTTP 400: Bad Request")}
	if err := executeAction(context.Background(), runner, ingest.Action{ID: 1, Kind: "kick", UserID: text(userID)}); err == nil || !strings.Contains(err.Error(), "400") {
		t.Fatalf("the REST error is reported: %v", err)
	}
	zero := 0
	if err := executeAction(context.Background(), &fakeRunner{}, ingest.Action{ID: 2, Kind: "shutdown", WaittimeS: &zero}); err == nil {
		t.Fatal("a shutdown needs a positive wait")
	}
	if err := executeAction(context.Background(), &fakeRunner{}, ingest.Action{ID: 3, Kind: "announce", Message: text("  ")}); err == nil {
		t.Fatal("an announce needs a message")
	}
	if err := executeAction(context.Background(), &fakeRunner{}, ingest.Action{ID: 4, Kind: "teleport"}); err == nil {
		t.Fatal("unknown kinds fail")
	}
}
