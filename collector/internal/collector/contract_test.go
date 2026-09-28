package collector

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/oddessentials/skylark/collector/internal/contract"
	"github.com/oddessentials/skylark/collector/internal/event"
	"github.com/oddessentials/skylark/collector/internal/ingest"
	"github.com/oddessentials/skylark/collector/internal/palrest"
	"github.com/oddessentials/skylark/collector/internal/saves"
	"github.com/oddessentials/skylark/collector/internal/serverlog"
	"github.com/oddessentials/skylark/collector/internal/world"
)

func worldFixture(t *testing.T, name string) palrest.GameData {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "world", "testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	var gameData palrest.GameData
	if err := json.Unmarshal(data, &gameData); err != nil {
		t.Fatal(err)
	}
	return gameData
}

func TestEveryEmittedTypeMatchesTheContract(t *testing.T) {
	path, err := contract.Find()
	if err != nil {
		t.Fatal(err)
	}
	validator, err := contract.Load(path)
	if err != nil {
		t.Fatal(err)
	}
	at := time.Date(2026, 9, 27, 22, 19, 11, 0, time.UTC)
	var items []emission
	mapper := &logMapper{tracker: world.NewTracker(), sendIPs: true}
	for _, name := range []string{"session-json.txt", "admin-json.txt", "windows-pipe.txt", "conpty.txt"} {
		items = append(items, mapAll(mapper, logRecords(t, name))...)
	}
	items = append(items, mapper.Map(serverlog.Record{Event: "kick", PlayerName: "RCON", Details: []string{userID, "afk"}}, at)...)
	items = append(items, mapper.Map(serverlog.Record{Event: "unban_failed", PlayerName: "REST", Details: []string{"bad id"}}, at)...)

	gameData := worldFixture(t, "gamedata-pals.json")
	snapshot, _ := world.FromGameData(gameData, []palrest.Player{{Name: "Wanderer", AccountName: "wanderer", PlayerID: playerID, UserID: userID, Ping: 12, Level: 4}})
	items = append(items, emission{event.TypeWorldSnapshot, at, snapshot})
	boxes, _ := world.FromGameData(worldFixture(t, "palboxes.json"), nil)
	items = append(items, emission{event.TypeWorldSnapshot, at, boxes})
	restOnly, _ := world.FromPlayers([]palrest.Player{{Name: "Wanderer", PlayerID: "None", UserID: userID, Level: 1}})
	items = append(items, emission{event.TypeWorldSnapshot, at, restOnly})

	tracker := world.NewTracker()
	tracker.Presence(nil, true)
	changes := tracker.Presence([]world.Observation{{UserID: userID, PlayerID: "", Name: "Wanderer", Level: 1}}, true)
	loaded := world.Observation{UserID: userID, PlayerID: playerID, Name: "Wanderer", Level: 3, Loaded: true, HasHP: true, HP: 400, X: 1, Y: 2, Z: event.Float(3)}
	changes = append(changes, tracker.Snapshot([]world.Observation{loaded})...)
	loaded.Level = 4
	loaded.HP = 0
	loaded.Action = palrest.ActionDeath
	changes = append(changes, tracker.Snapshot([]world.Observation{loaded})...)
	tracker.Presence(nil, true)
	changes = append(changes, tracker.Presence(nil, true)...)
	for _, change := range changes {
		if item, ok := changeEmission(change, at); ok {
			items = append(items, item)
		}
	}

	items = append(items,
		actionEmission(actionResult{Action: ingest.Action{ID: 1, Kind: "save"}}, at),
		actionEmission(actionResult{Action: ingest.Action{ID: 2, Kind: "kick"}, Err: errors.New("POST /kick: HTTP 400: Bad Request")}, at),
		emission{event.TypeServerMetrics, at, metricsData(palrest.Metrics{CurrentPlayerNum: 1, ServerFPS: 60, ServerFPSAverage: event.Float(59.2), ServerFrameTime: 16.6, MaxPlayerNum: 32, Uptime: 104})},
		emission{event.TypeServerMetrics, at, metricsData(palrest.Metrics{ServerFPS: 60})},
		emission{event.TypeServerOnline, at, event.ServerOnlineData{ServerInfo: serverInfo(palrest.Info{Version: "v1.0.5.102999", ServerName: "Skylark Test", WorldGUID: "D09CACDB477D6CE562170AA79C524138"})}},
		emission{event.TypeServerOffline, at, event.ServerOfflineData{Reason: event.OfflineUnreachable}},
		emission{event.TypeServerOffline, at, event.ServerOfflineData{Reason: event.OfflineCollectorStopping}},
		emission{event.TypeCollectorStarted, at, startedData(event.CollectorLayers{Rest: true, GameData: true, Logs: true, LogsSource: event.String("launch")}, &event.ServerInfo{Version: "v1.0.5.102999", Name: "Skylark Test", WorldGUID: "D09CACDB477D6CE562170AA79C524138"}, curateSettings(map[string]any{"DayTimeSpeedRate": 1.0, "NightTimeSpeedRate": 1.0, "ServerPlayerMaxNum": 32.0}))},
		emission{event.TypeCollectorStarted, at, startedData(event.CollectorLayers{}, nil, nil)},
		emission{event.TypeCollectorHeartbeat, at, event.CollectorHeartbeatData{UptimeS: 60.5, QueueDepth: 3, Rest: "down", GameData: "unavailable", Logs: "error"}},
		emission{event.TypeCollectorHeartbeat, at, event.CollectorHeartbeatData{UptimeS: 360, Rest: "ok", GameData: "ok", Logs: "ok", Saves: "ok"}},
	)
	level := 24
	saved := &saves.Result{
		SavedAt: at,
		Players: []event.SavePlayerData{
			{SavedAt: at, PlayerID: playerID, Name: event.String("Wanderer"), Level: &level, GuildID: event.String("6011D000000000000000000000000001"), LastOnlineAt: &at, Progress: &event.SaveProgress{Palpedia: 3, SpeciesCaptured: 2, Captures: 4, TowerBosses: []string{"GrassBoss"}, FieldBosses: 2, DungeonClears: 5, FixedDungeonClears: 2, Technologies: 3, FastTravelPoints: 1}},
			{SavedAt: at, PlayerID: "7A3B22D1000000000000000000000000"},
		},
		Guilds: []event.SaveGuildData{{SavedAt: at, GuildID: "6011D000000000000000000000000001", Name: "Lark Riders", BaseCampLevel: 3, Members: []event.SaveGuildMember{{PlayerID: playerID, Name: "Wanderer", Role: "guild_master"}}}},
		Bases:  []event.SaveBaseData{{SavedAt: at, BaseID: "BA5E0000000000000000000000000003", Name: event.String("Hilltop"), X: -73080.5, Y: -69035.25, Z: event.Float(-948.5), Workers: []event.SaveWorker{{InstanceID: "21000000000000000000000000000000", CharacterID: "SheepBall", Level: 9}}}},
	}
	for _, item := range saves.NewTracker().Changes(saved) {
		items = append(items, emission{item.Type, at, item.Data})
	}

	factory := event.NewFactory(event.NewUUID())
	seen := map[string]bool{}
	other := 0
	for _, item := range items {
		created, err := factory.New(item.Type, item.At, item.Data)
		if err != nil {
			t.Fatal(err)
		}
		raw, err := created.Marshal()
		if err != nil {
			t.Fatal(err)
		}
		if err := validator.ValidateEvent(raw); err != nil {
			t.Errorf("%v\n%s", err, raw)
		}
		if contract.EventSchema(item.Type) == "OtherEvent" {
			other++
		}
		seen[item.Type] = true
	}
	var missing []string
	for _, eventType := range contract.DocumentedTypes() {
		if !seen[eventType] {
			missing = append(missing, eventType)
		}
	}
	sort.Strings(missing)
	if len(missing) > 0 {
		t.Fatalf("no example for %s", strings.Join(missing, ", "))
	}
	if other == 0 {
		t.Fatal("no example of an undocumented type")
	}
}
