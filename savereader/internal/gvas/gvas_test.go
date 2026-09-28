package gvas_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/oddessentials/skylark/savereader/internal/gvas"
	g "github.com/oddessentials/skylark/savereader/internal/gvas/gvastest"
)

func read(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func TestAnEmptyWorldFromTheServerParses(t *testing.T) {
	meta, err := gvas.Parse(read(t, "LevelMeta.gvas"), gvas.Options{})
	if err != nil {
		t.Fatal(err)
	}
	h := meta.Header
	if h.SaveVersion != 3 || h.UE4Version != 522 || h.UE5Version != 1008 || h.EngineVersion != "5.1.1-0+++UE5+Release-5.1" || h.ClassName != "/Script/Pal.PalWorldBaseInfoSaveGame" {
		t.Fatalf("header %+v", h)
	}
	if name, _ := meta.Properties.Path("SaveData").String("WorldName"); name == "" {
		t.Fatalf("world name missing: %+v", meta.Properties)
	}
	level, err := gvas.Parse(read(t, "Level.gvas"), gvas.Options{})
	if err != nil {
		t.Fatal(err)
	}
	world := level.Properties.Fields("worldSaveData")
	groups := world.Map("GroupSaveDataMap")
	if len(groups) != 7 {
		t.Fatalf("an empty world has the 7 organisation groups, got %d", len(groups))
	}
	for _, entry := range groups {
		if _, ok := entry.Key.(gvas.GUID); !ok {
			t.Fatalf("group keys are guids, got %T", entry.Key)
		}
		kind, _ := entry.Value.(gvas.Properties).String("GroupType")
		if gvas.EnumValue(kind) != "Organization" {
			t.Fatalf("group type %q", kind)
		}
	}
	if _, ok := world.Path("GameTimeSaveData").Int("RealDateTimeTicks"); !ok {
		t.Fatal("the world clock is missing")
	}
	if world.Map("CharacterSaveParameterMap") != nil {
		t.Fatal("a world nobody joined has no characters")
	}
}

func TestSkippedPropertiesKeepTheirPlace(t *testing.T) {
	skipped := 0
	level, err := gvas.Parse(read(t, "Level.gvas"), gvas.Options{Skip: func(path string) bool {
		if strings.HasPrefix(path, "worldSaveData.Dungeon") {
			skipped++
			return true
		}
		return false
	}})
	if err != nil {
		t.Fatal(err)
	}
	world := level.Properties.Fields("worldSaveData")
	value, _ := world.Get("DungeonSaveData")
	if _, ok := value.(gvas.Skipped); !ok || skipped == 0 {
		t.Fatalf("dungeons were not skipped: %T", value)
	}
	if len(world.Map("GroupSaveDataMap")) != 7 {
		t.Fatal("parsing lost its place after a skip")
	}
}

func TestSyntheticDocument(t *testing.T) {
	data := g.Document("/Script/Test.Save",
		g.Int("Version", 100),
		g.Struct("SaveData", "TestSaveData",
			g.GUID("PlayerUId", "5E7A11C0"),
			g.Str("Title", "Wanderer of the dunes"),
			g.Str("Local", "ライラック"),
			g.Byte("Level", 42),
			g.Bool("IsPlayer", true),
			g.DateTime("LastOnlineDateTime", 639000000000000000),
			g.Names("Unlocked", "Workbench", "PalBox"),
			g.Map("Captured", "NameProperty", "IntProperty",
				g.Entry{Key: g.NameElem("SheepBall"), Value: g.IntElem(3)},
				g.Entry{Key: g.NameElem("PinkCat"), Value: g.IntElem(1)}),
			g.Map("Characters", "StructProperty", "StructProperty",
				g.Entry{
					Key:   g.FieldsElem(g.GUID("PlayerUId", "0"), g.GUID("InstanceId", "ABC")),
					Value: g.FieldsElem(g.Bytes("RawData", []byte{1, 2, 3})),
				}),
			g.Map("Groups", "StructProperty", "StructProperty",
				g.Entry{Key: g.GUIDElem("1234"), Value: g.FieldsElem(g.Enum("GroupType", "EPalGroupType", "EPalGroupType::Guild"))}),
		),
	)
	doc, err := gvas.Parse(data, gvas.Options{})
	if err != nil {
		t.Fatal(err)
	}
	save := doc.Properties.Fields("SaveData")
	if uid, _ := save.GUID("PlayerUId"); uid != "5E7A11C0000000000000000000000000" {
		t.Fatalf("uid %q", uid)
	}
	if title, _ := save.String("Title"); title != "Wanderer of the dunes" {
		t.Fatalf("title %q", title)
	}
	if local, _ := save.String("Local"); local != "ライラック" {
		t.Fatalf("utf-16 string %q", local)
	}
	if level, _ := save.Int("Level"); level != 42 || !save.Bool("IsPlayer") {
		t.Fatalf("level %d player %v", level, save.Bool("IsPlayer"))
	}
	if ticks, _ := save.DateTime("LastOnlineDateTime"); ticks != 639000000000000000 {
		t.Fatalf("ticks %d", ticks)
	}
	if unlocked := save.Array("Unlocked"); len(unlocked) != 2 || unlocked[1] != "PalBox" {
		t.Fatalf("names %v", unlocked)
	}
	captured := save.Map("Captured")
	if len(captured) != 2 || captured[0].Key != "SheepBall" || captured[0].Value != int64(3) {
		t.Fatalf("captured %+v", captured)
	}
	characters := save.Map("Characters")
	key := characters[0].Key.(gvas.Properties)
	if instance, _ := key.GUID("InstanceId"); instance != "ABC00000000000000000000000000000" {
		t.Fatalf("struct keys guessed as properties: %+v", characters[0].Key)
	}
	if raw := characters[0].Value.(gvas.Properties).Bytes("RawData"); len(raw) != 3 {
		t.Fatalf("raw %v", raw)
	}
	groups := save.Map("Groups")
	if groups[0].Key != gvas.GUID("12340000000000000000000000000000") {
		t.Fatalf("struct keys guessed as guids: %+v", groups[0].Key)
	}
	nested, consumed, err := gvas.ParseProperties(g.Stream(g.Int("A", 1)), gvas.Options{})
	if err != nil || len(nested) != 1 || consumed != len(g.Stream(g.Int("A", 1))) {
		t.Fatalf("stream %+v %d %v", nested, consumed, err)
	}
}

func TestTruncatedDataIsAnError(t *testing.T) {
	data := read(t, "LevelMeta.gvas")
	if _, err := gvas.Parse(data[:len(data)/2], gvas.Options{}); err == nil || !strings.Contains(err.Error(), "short") {
		t.Fatalf("expected a short read, got %v", err)
	}
	if _, err := gvas.Parse([]byte("PlM1"), gvas.Options{}); err == nil {
		t.Fatal("expected an error for data that is not GVAS")
	}
}
