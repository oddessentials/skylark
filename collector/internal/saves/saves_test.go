package saves

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/oddessentials/skylark/collector/internal/event"
)

const cannedWorld = `{"format":1,"saved_at":"2026-09-28T05:30:00Z",
"players":[{"player_id":"5E7A11C0000000000000000000000000","name":"Wanderer","level":24,"guild_id":"6011D000000000000000000000000001","last_online_at":"2026-09-28T05:10:00Z",
"progress":{"palpedia":3,"species_captured":2,"captures":4,"tower_bosses":["GrassBoss"],"field_bosses":2,"dungeon_clears":5,"fixed_dungeon_clears":2,"technologies":3,"fast_travel_points":1}}],
"guilds":[{"guild_id":"6011D000000000000000000000000001","name":"Lark Riders","base_camp_level":3,"members":[{"player_id":"5E7A11C0000000000000000000000000","name":"Wanderer","role":"guild_master"}]}],
"bases":[{"base_id":"BA5E0000000000000000000000000003","guild_id":"6011D000000000000000000000000001","name":"Hilltop","x":-73080.5,"y":-69035.25,"z":-948.5,"workers":[{"instance_id":"21000000000000000000000000000000","character_id":"SheepBall","level":9,"name":null}]}]}`

func TestMain(m *testing.M) {
	switch os.Getenv("SKYLARK_FAKE_SAVEREADER") {
	case "world":
		if len(os.Args) != 3 || os.Args[1] != "read" {
			fmt.Fprintln(os.Stderr, "usage")
			os.Exit(2)
		}
		fmt.Println(cannedWorld)
		os.Exit(0)
	case "fail":
		fmt.Fprintln(os.Stderr, "this build of the save reader has no Oodle decoder")
		os.Exit(3)
	case "future":
		fmt.Println(`{"format":2,"saved_at":"2026-09-28T05:30:00Z"}`)
		os.Exit(0)
	}
	os.Exit(m.Run())
}

func fakeReader(t *testing.T, mode string) string {
	t.Helper()
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("SKYLARK_FAKE_SAVEREADER", mode)
	return executable
}

func TestLocateFindsTheWorldFolder(t *testing.T) {
	root := t.TempDir()
	world := filepath.Join(root, "SaveGames", "0", "59FA02DC4EBF9EFC2E884F9E1BD86775")
	if err := os.MkdirAll(world, 0o755); err != nil {
		t.Fatal(err)
	}
	if _, ok := Locate([]string{root}, "59FA02DC4EBF9EFC2E884F9E1BD86775"); ok {
		t.Fatal("a folder without Level.sav is not a world")
	}
	os.WriteFile(filepath.Join(world, "Level.sav"), []byte("PlM1"), 0o644)
	for _, roots := range [][]string{{root}, {filepath.Join(root, "SaveGames", "0")}, {world}, {filepath.Join(root, "missing"), root}} {
		if dir, ok := Locate(roots, "59FA02DC4EBF9EFC2E884F9E1BD86775"); !ok || dir != world {
			t.Fatalf("roots %v found %q %v", roots, dir, ok)
		}
	}
	if _, ok := Locate([]string{root}, "OTHERWORLD"); ok {
		t.Fatal("another world's id matched")
	}
	if at, err := Modified(world); err != nil || time.Since(at) > time.Minute {
		t.Fatalf("modified %v %v", at, err)
	}
}

func TestReadRunsTheSaveReader(t *testing.T) {
	result, err := Read(context.Background(), fakeReader(t, "world"), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	savedAt := time.Date(2026, 9, 28, 5, 30, 0, 0, time.UTC)
	if !result.SavedAt.Equal(savedAt) || len(result.Players) != 1 || len(result.Guilds) != 1 || len(result.Bases) != 1 {
		t.Fatalf("result %+v", result)
	}
	player := result.Players[0]
	if !player.SavedAt.Equal(savedAt) || *player.Level != 24 || player.Progress.Palpedia != 3 || player.Progress.TowerBosses[0] != "GrassBoss" {
		t.Fatalf("player %+v", player)
	}
	base := result.Bases[0]
	if *base.Z != -948.5 || len(base.Workers) != 1 || base.Workers[0].CharacterID != "SheepBall" {
		t.Fatalf("base %+v", base)
	}
}

func TestReadReportsTheReadersError(t *testing.T) {
	_, err := Read(context.Background(), fakeReader(t, "fail"), t.TempDir())
	if err == nil || !strings.Contains(err.Error(), "no Oodle decoder") {
		t.Fatalf("error %v", err)
	}
	_, err = Read(context.Background(), fakeReader(t, "future"), t.TempDir())
	if err == nil || !strings.Contains(err.Error(), "format 2") {
		t.Fatalf("error %v", err)
	}
}

func TestTrackerSendsOnlyWhatChanged(t *testing.T) {
	result, err := Read(context.Background(), fakeReader(t, "world"), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	tracker := NewTracker()
	types := func(items []Emission) string {
		var names []string
		for _, item := range items {
			names = append(names, item.Type)
		}
		return strings.Join(names, ",")
	}
	if got := types(tracker.Changes(result)); got != "save.player,save.guild,save.base,save.read" {
		t.Fatalf("first read sends everything: %s", got)
	}
	later := *result
	later.SavedAt = result.SavedAt.Add(5 * time.Minute)
	if got := types(tracker.Changes(&later)); got != "" {
		t.Fatalf("an unchanged world sends nothing: %s", got)
	}
	levelled := *result.Players[0].Level + 1
	changed := later
	changed.Players = []event.SavePlayerData{result.Players[0]}
	changed.Players[0].Level = &levelled
	if got := types(tracker.Changes(&changed)); got != "save.player,save.read" {
		t.Fatalf("a level-up sends the player: %s", got)
	}
	gone := changed
	gone.Bases = nil
	emissions := tracker.Changes(&gone)
	if got := types(emissions); got != "save.read" {
		t.Fatalf("a removed base sends the read summary: %s", got)
	}
	if read := emissions[0].Data.(event.SaveReadData); len(read.BaseIDs) != 0 || len(read.PlayerIDs) != 1 {
		t.Fatalf("read %+v", read)
	}
	if got := types(tracker.Changes(&changed)); got != "save.base,save.read" {
		t.Fatalf("a base that comes back unchanged is sent again: %s", got)
	}
}
