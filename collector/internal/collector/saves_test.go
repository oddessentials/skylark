package collector

import (
	"fmt"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const fakeWorld = `{"format":1,"saved_at":"2026-09-28T05:30:00Z",
"players":[{"player_id":"5E7A11C0000000000000000000000000","name":"Wanderer","level":24,"guild_id":"6011D000000000000000000000000001","last_online_at":"2026-09-28T05:10:00Z",
"progress":{"palpedia":3,"species_captured":2,"captures":4,"tower_bosses":["GrassBoss"],"field_bosses":2,"dungeon_clears":5,"fixed_dungeon_clears":2,"technologies":3,"fast_travel_points":1}}],
"guilds":[{"guild_id":"6011D000000000000000000000000001","name":"Lark Riders","base_camp_level":3,"members":[{"player_id":"5E7A11C0000000000000000000000000","name":"Wanderer","role":"guild_master"}]}],
"bases":[{"base_id":"BA5E0000000000000000000000000003","guild_id":"6011D000000000000000000000000001","name":null,"x":-73080.5,"y":-69035.25,"z":-948.5,"workers":[{"instance_id":"21000000000000000000000000000000","character_id":"SheepBall","level":9,"name":null}]}]}`

func TestMain(m *testing.M) {
	if os.Getenv("SKYLARK_FAKE_SAVEREADER") == "world" {
		if len(os.Args) == 3 && os.Args[1] == "read" {
			fmt.Println(fakeWorld)
			os.Exit(0)
		}
		fmt.Fprintln(os.Stderr, "usage")
		os.Exit(2)
	}
	os.Exit(m.Run())
}

func TestCollectorReadsTheWorldSave(t *testing.T) {
	server := newFakeServer(t)
	server.gameDataOff = true
	rest := httptest.NewServer(server)
	defer rest.Close()
	site := &fakeSite{secret: "site-secret"}
	ingestServer := httptest.NewServer(site)
	defer ingestServer.Close()
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("SKYLARK_FAKE_SAVEREADER", "world")
	root := t.TempDir()
	world := filepath.Join(root, "SaveGames", "0", "D09CACDB477D6CE562170AA79C524138")
	if err := os.MkdirAll(world, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(world, "Level.sav"), []byte("PlM1"), 0o644); err != nil {
		t.Fatal(err)
	}
	cfg := testConfig(t, rest.URL, ingestServer.URL, "none")
	cfg.Saves.Reader = executable
	cfg.Saves.Interval = time.Minute
	cfg.SaveRoots = []string{root}
	cancel, done := start(t, cfg, nil)
	for _, eventType := range []string{"save.player", "save.guild", "save.base", "save.read"} {
		eventually(t, eventType, func() bool { return site.has(eventType, nil) })
	}
	if !site.has("save.player", func(data string) bool {
		return strings.Contains(data, `"palpedia":3`) && strings.Contains(data, `"saved_at":"2026-09-28T05:30:00Z"`)
	}) {
		t.Fatal("the player's progress and the save time reach the site")
	}
	if !site.has("collector.started", func(data string) bool { return strings.Contains(data, `"saves":true`) }) {
		t.Fatal("collector.started reports the saves layer")
	}
	eventually(t, "a heartbeat with the save state", func() bool {
		return site.has("collector.heartbeat", func(data string) bool { return strings.Contains(data, `"saves":"ok"`) })
	})
	stop(t, cancel, done)
	validateAll(t, site)
}
