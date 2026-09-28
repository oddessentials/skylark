package modevents

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

var received = time.Date(2026, 9, 28, 15, 0, 0, 0, time.UTC)

func TestParseReadsEachType(t *testing.T) {
	cases := map[string]string{
		TypeCapture:    `{"v":1,"type":"capture","ts":"2026-09-28T15:19:55Z","player_id":"a0000951000000000000000000000000","name":"Moss","species":"SheepBall","level":12}`,
		TypeHatch:      `{"v":1,"type":"hatch","ts":"2026-09-28T15:19:55Z","player_id":"A0000951000000000000000000000000","species":"ChickenPal","level":1}`,
		TypeBoss:       `{"v":1,"type":"boss","ts":"2026-09-28T15:19:55Z","player_id":"A0000951000000000000000000000000","boss":"GrassBoss","kind":"tower","difficulty":"hard"}`,
		TypeTechnology: `{"v":1,"type":"technology","ts":"2026-09-28T15:19:55Z","player_id":"A0000951000000000000000000000000","technology":"RepairBench"}`,
		TypeBuild:      `{"v":1,"type":"build","ts":"2026-09-28T15:19:55Z","player_id":"A0000951000000000000000000000000","structure":"Workbench"}`,
		TypeKnockout:   `{"v":1,"type":"knockout","ts":"2026-09-28T15:19:55Z","player_id":"A0000951000000000000000000000000","cause":"drown"}`,
	}
	for kind, line := range cases {
		record, err := Parse(line, received)
		if err != nil {
			t.Fatalf("%s: %v", kind, err)
		}
		if record.Type != kind {
			t.Errorf("%s: type %s", kind, record.Type)
		}
		if record.PlayerID != "A0000951000000000000000000000000" {
			t.Errorf("%s: player id %s", kind, record.PlayerID)
		}
		if !record.At.Equal(time.Date(2026, 9, 28, 15, 19, 55, 0, time.UTC)) {
			t.Errorf("%s: at %s", kind, record.At)
		}
	}
}

func TestParseRejectsWhatTheSiteWouldFlag(t *testing.T) {
	cases := map[string]string{
		"not json":           `{"v":1,`,
		"a newer version":    `{"v":2,"type":"build","structure":"Workbench"}`,
		"an unknown type":    `{"v":1,"type":"fishing"}`,
		"no species":         `{"v":1,"type":"capture"}`,
		"no boss":            `{"v":1,"type":"boss","kind":"tower"}`,
		"an unknown kind":    `{"v":1,"type":"boss","boss":"GrassBoss","kind":"field"}`,
		"a wrong difficulty": `{"v":1,"type":"boss","boss":"GrassBoss","kind":"tower","difficulty":"nightmare"}`,
		"no technology":      `{"v":1,"type":"technology"}`,
		"no structure":       `{"v":1,"type":"build"}`,
	}
	for name, line := range cases {
		if _, err := Parse(line, received); err == nil {
			t.Errorf("%s: parsed %s", name, line)
		}
	}
	if _, err := Parse(`{"v":1,"type":"fishing"}`, received); !errors.Is(err, ErrUnknownType) {
		t.Errorf("an unknown type should be ErrUnknownType, got %v", err)
	}
}

func TestParseFallsBackToTheTimeItWasRead(t *testing.T) {
	record, err := Parse(`{"v":1,"type":"knockout","player_id":"A0000951000000000000000000000000"}`, received)
	if err != nil {
		t.Fatal(err)
	}
	if !record.At.Equal(received) {
		t.Fatalf("at %s", record.At)
	}
}

func TestKillerPrefersTheNameThenTheIdThenTheCharacter(t *testing.T) {
	cases := []struct {
		record Record
		killer string
		kind   string
	}{
		{Record{KillerName: "Rook", KillerID: "B0000952000000000000000000000000"}, "Rook", KillerPlayer},
		{Record{KillerID: "B0000952000000000000000000000000"}, "B0000952000000000000000000000000", KillerPlayer},
		{Record{KillerSpecies: "BOSS_SheepBall"}, "BOSS_SheepBall", KillerCharacter},
		{Record{}, "", ""},
	}
	for _, c := range cases {
		killer, kind := c.record.Killer()
		if killer != c.killer || kind != c.kind {
			t.Errorf("%+v: got %q %q", c.record, killer, kind)
		}
	}
}

func TestLocateFindsTheModLoaderLayoutBeforeTheClassicOne(t *testing.T) {
	root := t.TempDir()
	executable := filepath.Join(root, "Pal", "Binaries", "Win64", "PalServer-Win64-Shipping-Cmd.exe")
	classic := filepath.Join(root, "Pal", "Binaries", "Win64", "ue4ss", "Mods")
	if err := os.MkdirAll(classic, 0o755); err != nil {
		t.Fatal(err)
	}
	if got := ServerRoot(executable); got != root {
		t.Fatalf("server root %s", got)
	}
	if got := Locate(root); got != filepath.Join(classic, FileName) {
		t.Fatalf("classic layout: %s", got)
	}
	official := filepath.Join(root, "Mods", "NativeMods", "UE4SS", "Mods")
	if err := os.MkdirAll(official, 0o755); err != nil {
		t.Fatal(err)
	}
	if got := Locate(root); got != filepath.Join(official, FileName) {
		t.Fatalf("mod loader layout: %s", got)
	}
	if got := Locate(t.TempDir()); got != "" {
		t.Fatalf("a server without UE4SS: %s", got)
	}
	if got := ServerRoot(filepath.Join(t.TempDir(), "elsewhere", "server.exe")); got != "" {
		t.Fatalf("not a server: %s", got)
	}
	if !strings.HasSuffix(Candidates(root)[0], FileName) {
		t.Fatal("candidates name the events file")
	}
}
