package palworld

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestSampleSavesFromARealServer(t *testing.T) {
	dir := os.Getenv("SKYLARK_SAVE_SAMPLES")
	if dir == "" {
		t.Skip("set SKYLARK_SAVE_SAMPLES to a folder of decompressed saves to run this")
	}
	level, err := os.ReadFile(filepath.Join(dir, "Level.gvas"))
	if err != nil {
		t.Fatal(err)
	}
	players := map[string][]byte{}
	files, _ := filepath.Glob(filepath.Join(dir, "Players", "*.gvas"))
	for _, file := range files {
		uid := strings.TrimSuffix(filepath.Base(file), ".gvas")
		if strings.Contains(uid, "_") {
			continue
		}
		data, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		players[uid] = data
	}
	started := time.Now()
	world, err := Extract(level, players, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	workers := 0
	for _, base := range world.Bases {
		workers += len(base.Workers)
	}
	members := 0
	for _, guild := range world.Guilds {
		members += len(guild.Members)
	}
	withProgress := 0
	for _, player := range world.Players {
		if player.Progress != nil {
			withProgress++
		}
	}
	t.Logf("%d players (%d with records), %d guilds with %d members, %d bases with %d workers, in %s", len(world.Players), withProgress, len(world.Guilds), members, len(world.Bases), workers, time.Since(started))
	if len(world.Players) == 0 || len(world.Guilds) == 0 || len(world.Bases) == 0 {
		t.Fatal("expected players, guilds and bases")
	}
}
