package collector

import (
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/oddessentials/skylark/collector/internal/config"
	"github.com/oddessentials/skylark/collector/internal/palrest"
)

const modLines = `{"v":1,"type":"technology","ts":"2026-09-28T15:19:55Z","player_id":"5e7a11c0000000000000000000000000","name":"Wanderer","technology":"RepairBench"}
{"v":1,"type":"build","ts":"2026-09-28T15:20:23Z","player_id":"5E7A11C0000000000000000000000000","structure":"RepairBench"}
{"v":1,"type":"capture","ts":"2026-09-28T15:21:02Z","player_id":"5E7A11C0000000000000000000000000","name":"Wanderer","species":"BOSS_SheepBall","level":12}
{"v":1,"type":"boss","ts":"2026-09-28T15:21:30Z","player_id":"5E7A11C0000000000000000000000000","boss":"GrassBoss","kind":"tower","difficulty":"hard"}
{"v":1,"type":"knockout","ts":"2026-09-28T15:22:22Z","player_id":"5E7A11C0000000000000000000000000","name":"Wanderer","cause":"attack","killer_species":"BOSS_SheepBall","killer_level":12}
{"v":1,"type":"knockout","ts":"2026-09-28T15:23:40Z","player_id":"5E7A11C0000000000000000000000000","name":"Wanderer","cause":"attack","killer_player_id":"B0000952000000000000000000000000"}
{"v":1,"type":"capture","ts":"2026-09-28T15:24:00Z","player_id":"C0000953000000000000000000000000","species":"ChickenPal","level":2}
this is not a mod event
{"v":1,"type":"hatch","ts":"2026-09-28T15:25:00Z","player_id":"5E7A11C0000000000000000000000000","species":"ChickenPal","level":1}
`

func TestCollectorForwardsTheModsEvents(t *testing.T) {
	server := newFakeServer(t)
	server.gameDataOff = true
	rest := httptest.NewServer(server)
	defer rest.Close()
	site := &fakeSite{secret: "site-secret"}
	ingestServer := httptest.NewServer(site)
	defer ingestServer.Close()
	cfg := testConfig(t, rest.URL, ingestServer.URL, config.SourceNone)
	cfg.Mod.Events = filepath.Join(t.TempDir(), "skylark-events.jsonl")
	cancel, done := start(t, cfg, nil)
	eventually(t, "collector.started with the mod layer", func() bool {
		return site.has("collector.started", func(data string) bool { return strings.Contains(data, `"mod":true`) })
	})
	server.set(func(s *fakeServer) {
		s.players = []palrest.Player{{Name: "Wanderer", AccountName: "wanderer", PlayerID: playerID, UserID: userID, Ping: 20, LocationX: -346912, LocationY: 261690, Level: 12}}
	})
	eventually(t, "the join from REST", func() bool { return site.has("player.joined", nil) })
	if err := os.WriteFile(cfg.Mod.Events, []byte(modLines), 0o644); err != nil {
		t.Fatal(err)
	}
	eventually(t, "the hatch, the last line", func() bool { return site.has("pal.hatched", nil) })
	checks := map[string]func(string) bool{
		"technology.unlocked": func(data string) bool {
			return strings.Contains(data, `"technology":"RepairBench"`) && strings.Contains(data, `"user_id":"`+userID+`"`)
		},
		"structure.built": func(data string) bool {
			return strings.Contains(data, `"structure":"RepairBench"`) && strings.Contains(data, `"name":"Wanderer"`)
		},
		"pal.captured": func(data string) bool {
			return strings.Contains(data, `"species":"BOSS_SheepBall"`) && strings.Contains(data, `"level":12`)
		},
		"boss.defeated": func(data string) bool {
			return strings.Contains(data, `"kind":"tower"`) && strings.Contains(data, `"difficulty":"hard"`)
		},
	}
	for eventType, check := range checks {
		if !site.has(eventType, check) {
			t.Errorf("no %s with the mod's details", eventType)
		}
	}
	if !site.has("player.died", func(data string) bool {
		return strings.Contains(data, `"source":"mod"`) && strings.Contains(data, `"killer":"BOSS_SheepBall"`) &&
			strings.Contains(data, `"killer_kind":"character"`) && strings.Contains(data, `"killer_level":12`) &&
			strings.Contains(data, `"x":-346912`)
	}) {
		t.Error("the knockout by a Pal carries its killer and the player's position")
	}
	if !site.has("player.died", func(data string) bool {
		return strings.Contains(data, `"killer_kind":"player"`) && strings.Contains(data, `"killer":null`)
	}) {
		t.Error("a killer known only by player id is not named")
	}
	for _, item := range site.received() {
		if item.Type == "pal.captured" && strings.Contains(string(item.Raw), "ChickenPal") {
			t.Error("a capture by a player who is not online reached the site")
		}
		if strings.Contains(string(item.Raw), "B0000952000000000000000000000000") {
			t.Error("the killer's player id reached the site")
		}
	}
	eventually(t, "a heartbeat with the mod state", func() bool {
		return site.has("collector.heartbeat", func(data string) bool { return strings.Contains(data, `"mod":"ok"`) })
	})
	stop(t, cancel, done)
	validateAll(t, site)
}
