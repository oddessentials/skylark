package world

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/oddessentials/skylark/collector/internal/event"
	"github.com/oddessentials/skylark/collector/internal/palrest"
)

const (
	userID   = "steam_76561190000000101"
	playerID = "5E7A11C0000000000000000000000000"
)

type recordedGameData struct {
	ReadAt string `json:"read_at"`
	palrest.GameData
}

type recordedPlayers struct {
	ReadAt  string           `json:"read_at"`
	Players []palrest.Player `json:"players"`
}

func readJSONLines[T any](t *testing.T, name string) []T {
	t.Helper()
	file, err := os.Open(filepath.Join("testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	var out []T
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 64*1024), 16*1024*1024)
	for scanner.Scan() {
		if strings.TrimSpace(scanner.Text()) == "" {
			continue
		}
		var item T
		if err := json.Unmarshal(scanner.Bytes(), &item); err != nil {
			t.Fatal(err)
		}
		out = append(out, item)
	}
	return out
}

func readJSON[T any](t *testing.T, name string) T {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	var out T
	if err := json.Unmarshal(data, &out); err != nil {
		t.Fatal(err)
	}
	return out
}

func deref(value *string) string {
	if value == nil {
		return "<nil>"
	}
	return *value
}

func TestSnapshotFromGameData(t *testing.T) {
	gameData := readJSON[palrest.GameData](t, "gamedata-pals.json")
	data, observations := FromGameData(gameData, []palrest.Player{{
		Name: "Wanderer", AccountName: "wanderer_account", PlayerID: playerID, UserID: userID, Ping: 14, Level: 4,
	}})
	if data.Source != "gamedata" || deref(data.InGameTime) != "12:46" || data.InGameDay == nil || *data.InGameDay != 1 {
		t.Fatalf("header %+v", data)
	}
	if len(data.Players) != 1 {
		t.Fatalf("players %+v", data.Players)
	}
	player := data.Players[0]
	if player.UserID != userID || deref(player.PlayerID) != playerID || player.Name != "Wanderer" || player.Level != 4 {
		t.Fatalf("player %+v", player)
	}
	if deref(player.AccountName) != "wanderer_account" || player.Ping == nil || *player.Ping != 14 || player.HP == nil || *player.HP != 500 || player.Z == nil {
		t.Fatalf("merged player %+v", player)
	}
	if deref(player.GuildName) != "Unnamed Guild" || player.Action != nil {
		t.Fatalf("player guild and action %+v", player)
	}
	kinds := map[string]int{}
	for _, pal := range data.Pals {
		kinds[pal.Kind]++
		switch pal.Kind {
		case "party":
			if deref(pal.OwnerPlayerID) != playerID || deref(pal.OwnerName) != "Wanderer" || deref(pal.AIAction) == "<nil>" {
				t.Fatalf("party pal %+v", pal)
			}
		case "base":
			if pal.OwnerPlayerID != nil || pal.OwnerInstanceID != nil || pal.GuildID == nil {
				t.Fatalf("base pal %+v", pal)
			}
		}
		if !strings.Contains(pal.InstanceID, " : ") || !strings.HasPrefix(pal.Class, "BP_") {
			t.Fatalf("pal %+v", pal)
		}
	}
	if kinds["party"] != 1 || kinds["base"] == 0 {
		t.Fatalf("pal kinds %v", kinds)
	}
	if len(data.PalBoxes) < 2 {
		t.Fatalf("palboxes %+v", data.PalBoxes)
	}
	emptyGuild := 0
	for _, box := range data.PalBoxes {
		if box.GuildID == nil {
			emptyGuild++
			if box.GuildName != nil || box.Name != nil {
				t.Fatalf("a new palbox has neither guild name nor name: %+v", box)
			}
		}
	}
	if emptyGuild != 1 {
		t.Fatalf("expected one new palbox without a guild, got %d", emptyGuild)
	}
	if len(data.Wild) == 0 {
		t.Fatal("expected wild pals")
	}
	for _, wild := range data.Wild {
		if wild.Class == "" || wild.Level <= 0 {
			t.Fatalf("wild %+v", wild)
		}
	}
	encoded, _ := json.Marshal(data)
	for _, forbidden := range []string{"192.0.2.10", "Scouting Party Survivor", `"ip"`} {
		if strings.Contains(string(encoded), forbidden) {
			t.Fatalf("the snapshot must not contain %s", forbidden)
		}
	}
	if len(observations) != 1 || !observations[0].Loaded || !observations[0].HasHP {
		t.Fatalf("observations %+v", observations)
	}
}

func TestSnapshotFromPlayersOnly(t *testing.T) {
	loading := readJSON[struct {
		Players []palrest.Player `json:"players"`
	}](t, "players-loading.json")
	data, observations := FromPlayers(loading.Players)
	if data.Source != "rest" || data.InGameTime != nil || data.InGameDay != nil || len(data.Pals) != 0 || len(data.PalBoxes) != 0 || len(data.Wild) != 0 {
		t.Fatalf("header %+v", data)
	}
	if len(data.Players) != 1 || data.Players[0].PlayerID != nil || data.Players[0].Level != 1 {
		t.Fatalf("a loading player has no player id yet: %+v", data.Players)
	}
	if observations[0].Loaded {
		t.Fatal("a player whose id is None is still loading")
	}
	encoded, _ := json.Marshal(data)
	if strings.Contains(string(encoded), "192.0.2.10") {
		t.Fatal("the snapshot must not contain the player's address")
	}
	if !strings.Contains(string(encoded), `"pals":[]`) {
		t.Fatalf("empty lists stay lists: %s", encoded)
	}
}

func TestPalBoxesWithNobodyOnline(t *testing.T) {
	gameData := readJSON[palrest.GameData](t, "palboxes.json")
	data, observations := FromGameData(gameData, nil)
	if len(data.PalBoxes) != 15 || len(data.Players) != 0 || len(observations) != 0 {
		t.Fatalf("palboxes %d players %d", len(data.PalBoxes), len(data.Players))
	}
	for _, box := range data.PalBoxes {
		if box.GuildID == nil || box.Name == nil || box.Class != "BP_BuildObject_PalBoxV2_C" {
			t.Fatalf("box %+v", box)
		}
	}
	if deref(data.InGameTime) != "14:26" || *data.InGameDay != 61 {
		t.Fatalf("time %s day %d", deref(data.InGameTime), *data.InGameDay)
	}
}

func replay(t *testing.T, tracker *Tracker, name string) ([]Change, []string) {
	t.Helper()
	var changes []Change
	var times []string
	for _, record := range readJSONLines[recordedGameData](t, name) {
		_, observations := FromGameData(record.GameData, nil)
		for _, change := range tracker.Snapshot(observations) {
			changes = append(changes, change)
			times = append(times, record.ReadAt)
		}
	}
	return changes, times
}

func TestDeathIsReportedOncePerDeath(t *testing.T) {
	changes, times := replay(t, NewTracker(), "gamedata-death.jsonl")
	if len(changes) != 1 || changes[0].Kind != Died {
		t.Fatalf("changes %+v", changes)
	}
	death := changes[0]
	if death.UserID != userID || death.PlayerID != playerID || death.Name != "Wanderer" || death.Z == nil {
		t.Fatalf("death %+v", death)
	}
	if times[0] != "2026-09-28T02:23:24.242Z" {
		t.Fatalf("the death shows in the snapshot of 02:23:24, got %s", times[0])
	}
	if int(death.X) != -346912 {
		t.Fatalf("the death position is where the HP reached zero, got %f", death.X)
	}
}

func TestLevelUpsAndLoading(t *testing.T) {
	tracker := NewTracker()
	joinChanges, _ := replay(t, tracker, "gamedata-join.jsonl")
	if len(joinChanges) != 0 {
		t.Fatalf("loading must not look like a level up: %+v", joinChanges)
	}
	changes, _ := replay(t, tracker, "gamedata-levels.jsonl")
	var ups []string
	for _, change := range changes {
		if change.Kind != LevelUp {
			t.Fatalf("unexpected change %+v", change)
		}
		ups = append(ups, strings.Join([]string{string(rune('0' + change.From)), string(rune('0' + change.To))}, ">"))
	}
	if strings.Join(ups, " ") != "2>3 3>4" {
		t.Fatalf("level ups %v", ups)
	}
}

func TestLevelsNeverGoBackwards(t *testing.T) {
	tracker := NewTracker()
	observe := func(level int) []Change {
		return tracker.Snapshot([]Observation{{UserID: userID, PlayerID: playerID, Name: "Wanderer", Level: level, Loaded: true, HasHP: true, HP: 100}})
	}
	observe(3)
	if changes := observe(5); len(changes) != 1 || changes[0].From != 3 || changes[0].To != 5 {
		t.Fatalf("changes %+v", changes)
	}
	if changes := observe(4); len(changes) != 0 {
		t.Fatalf("a stale lower level is ignored: %+v", changes)
	}
	if changes := observe(5); len(changes) != 0 {
		t.Fatalf("changes %+v", changes)
	}
}

func presence(t *testing.T, tracker *Tracker, emit bool) []string {
	t.Helper()
	var out []string
	for _, record := range readJSONLines[recordedPlayers](t, "players-session.jsonl") {
		_, observations := FromPlayers(record.Players)
		for _, change := range tracker.Presence(observations, emit) {
			out = append(out, record.ReadAt[11:19]+" "+string(change.Kind))
		}
	}
	return out
}

func TestJoinsAndLeavesFromRest(t *testing.T) {
	tracker := NewTracker()
	got := presence(t, tracker, true)
	if strings.Join(got, ", ") != "02:19:18 joined, 02:32:28 level_up" {
		t.Fatalf("got %v", got)
	}
	changes := tracker.Presence(nil, true)
	if len(changes) != 1 || changes[0].Kind != Left || changes[0].PlayerID != playerID || changes[0].Name != "Wanderer" {
		t.Fatalf("the second empty poll reports the leave: %+v", changes)
	}
}

func TestPlayersOnlineAtStartAreNotJoins(t *testing.T) {
	tracker := NewTracker()
	online := []Observation{{UserID: userID, PlayerID: playerID, Name: "Wanderer", Level: 3, Loaded: true}}
	if changes := tracker.Presence(online, true); len(changes) != 0 {
		t.Fatalf("the first poll is the baseline: %+v", changes)
	}
	tracker.Presence(nil, true)
	if changes := tracker.Presence(nil, true); len(changes) != 1 || changes[0].Kind != Left {
		t.Fatalf("a player present at start still gets a leave: %+v", changes)
	}
}

func TestLogAndRestNeverBothReport(t *testing.T) {
	tracker := NewTracker()
	tracker.Presence(nil, false)
	online := []Observation{{UserID: userID, PlayerID: playerID, Name: "Wanderer", Level: 2, Loaded: true}}
	if changes := tracker.Presence(online, false); len(changes) != 0 {
		t.Fatalf("REST stays quiet while the log is live: %+v", changes)
	}
	if !tracker.LogJoin(userID, playerID, "Wanderer") {
		t.Fatal("the delayed log join is still reported")
	}
	if tracker.LogJoin(userID, playerID, "Wanderer") {
		t.Fatal("a repeated join is not reported twice")
	}
	tracker.Presence(nil, false)
	tracker.Presence(nil, false)
	emit, id := tracker.LogLeft(userID, "Wanderer")
	if !emit || id != playerID {
		t.Fatalf("the log leave is reported with the known player id, got %v %s", emit, id)
	}
	if changes := tracker.Presence(online, true); len(changes) != 1 || changes[0].Kind != Joined {
		t.Fatalf("after the log goes quiet REST reports the rejoin: %+v", changes)
	}
	if tracker.LogJoin(userID, playerID, "Wanderer") {
		t.Fatal("a late log join for the same session is not reported again")
	}
}

func TestFitTrimsWildBeforePals(t *testing.T) {
	data := event.WorldSnapshotData{Source: "gamedata", Players: []event.SnapshotPlayer{}, PalBoxes: []event.SnapshotPalBox{}}
	for i := 0; i < 3000; i++ {
		data.Wild = append(data.Wild, event.SnapshotWild{Class: "BP_SheepBall_C", Name: event.String("Lamball"), Level: i % 50, X: -348109.71875, Y: 270678.8125})
	}
	for i := 0; i < 50; i++ {
		data.Pals = append(data.Pals, event.SnapshotPal{InstanceID: "00000000000000000000000000000000 : A0000001BBBBBBBBCCCCCCCCD0000001", Kind: "base", Class: "BP_PinkCat_C", Level: 4})
	}
	if err := Fit(&data, 100*1024); err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(data)
	if len(encoded) > 100*1024 || data.WildOmitted == 0 || data.PalsOmitted != 0 || len(data.Pals) != 50 {
		t.Fatalf("size %d wild omitted %d pals omitted %d", len(encoded), data.WildOmitted, data.PalsOmitted)
	}
	if data.Wild[0].Level != 49 {
		t.Fatal("the strongest wild pals are kept")
	}
}
