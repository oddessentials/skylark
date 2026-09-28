package palworld

import (
	"encoding/json"
	"reflect"
	"testing"
	"time"

	g "github.com/oddessentials/skylark/savereader/internal/gvas/gvastest"
)

const (
	wanderer  = "5E7A11C0000000000000000000000000"
	fisher    = "7A3B22D1000000000000000000000000"
	guildID   = "6011D000000000000000000000000001"
	orgID     = "0F6A0000000000000000000000000002"
	baseID    = "BA5E0000000000000000000000000003"
	workers   = "C0A7A1E1000000000000000000000004"
	party     = "C0A7A1E2000000000000000000000005"
	savedTick = int64(639262000000000000)
)

func characterEntry(uid, instance string, raw []byte) g.Entry {
	return g.Entry{
		Key:   g.FieldsElem(g.GUID("PlayerUId", uid), g.GUID("InstanceId", instance), g.Str("DebugName", "")),
		Value: g.FieldsElem(g.Bytes("RawData", raw), g.Bytes("CustomVersionData", []byte{0, 0, 0, 0})),
	}
}

func characterRaw(group string, fields ...g.Prop) []byte {
	var b g.Buffer
	b.Write(g.Stream(g.Struct("SaveParameter", "PalIndividualCharacterSaveParameter", fields...)))
	b.I32(0).GUID(group).I32(0)
	return b.Bytes()
}

func slot(container string, index int32) g.Prop {
	return g.Struct("SlotId", "PalCharacterSlotId",
		g.Struct("ContainerId", "PalContainerId", g.GUID("ID", container)),
		g.Int("SlotIndex", index))
}

func transform(b *g.Buffer, x, y, z float64) {
	b.F64(0).F64(0).F64(0).F64(1)
	b.F64(x).F64(y).F64(z)
	b.F64(1).F64(1).F64(1)
}

func guildRaw() []byte {
	var b g.Buffer
	b.GUID(guildID).String(wanderer)
	b.I32(3)
	b.GUID(wanderer).GUID("11")
	b.GUID(fisher).GUID("12")
	b.GUID("").GUID("13")
	b.U8(0).I32(0)
	b.I32(1).GUID(baseID)
	b.I32(0).I32(3)
	b.I32(1).GUID("99")
	b.String("Lark Riders")
	b.GUID(wanderer).I32(0)
	b.I32(2).U8(2).U8(3)
	b.I32(0)
	b.GUID(wanderer)
	b.I32(2)
	b.GUID(wanderer).I64(1000).String("Wanderer").U8(1)
	b.GUID(fisher).I64(2000).String("Fisher").U8(3)
	b.I32(1).U8(3).I32(2).U8(4).U8(7)
	b.I32(0)
	return b.Bytes()
}

func baseFields() []g.Prop {
	var raw g.Buffer
	raw.GUID(baseID).String("Hilltop").U8(1)
	transform(&raw, -73080.5, -69035.25, -948.5)
	raw.F32(3500).GUID(guildID)
	raw.Write(make([]byte, 40))
	var director g.Buffer
	director.GUID(baseID)
	transform(&director, -73080.5, -69035.25, -948.5)
	director.U8(0).U8(0).GUID(workers).I32(0)
	return []g.Prop{
		g.Struct("WorkerDirector", "PalBaseCampSaveData_WorkerDirector", g.Bytes("RawData", director.Bytes())),
		g.Bytes("RawData", raw.Bytes()),
	}
}

func level() []byte {
	var org g.Buffer
	org.GUID(orgID).String("").I32(0).U8(1).I32(0).I32(0)
	return g.Document("/Script/Pal.PalWorldSaveGame",
		g.Int("Version", 100),
		g.Struct("worldSaveData", "PalWorldSaveData",
			g.Map("CharacterSaveParameterMap", "StructProperty", "StructProperty",
				characterEntry(wanderer, "11", characterRaw(guildID, g.Byte("Level", 24), g.Str("NickName", "Wanderer"), g.Bool("IsPlayer", true))),
				characterEntry(fisher, "12", characterRaw(guildID, g.Byte("Level", 7), g.Str("NickName", "Fisher"), g.Bool("IsPlayer", true))),
				characterEntry("", "21", characterRaw(guildID, g.Name("CharacterID", "SheepBall"), g.Byte("Level", 9), slot(workers, 0))),
				characterEntry("", "22", characterRaw(guildID, g.Name("CharacterID", "BOSS_FoxMage"), g.Byte("Level", 28), g.Str("NickName", "Ember"), slot(workers, 1))),
				characterEntry("", "23", characterRaw(guildID, g.Name("CharacterID", "PinkCat"), g.Byte("Level", 4), slot(party, 0))),
			),
			g.Map("MapObjectSaveData", "NameProperty", "IntProperty", g.Entry{Key: g.NameElem("Skipped"), Value: g.IntElem(1)}),
			g.Map("BaseCampSaveData", "StructProperty", "StructProperty",
				g.Entry{Key: g.GUIDElem(baseID), Value: g.FieldsElem(baseFields()...)}),
			g.Map("GroupSaveDataMap", "StructProperty", "StructProperty",
				g.Entry{Key: g.GUIDElem(orgID), Value: g.FieldsElem(g.Enum("GroupType", "EPalGroupType", "EPalGroupType::Organization"), g.Bytes("RawData", org.Bytes()))},
				g.Entry{Key: g.GUIDElem(guildID), Value: g.FieldsElem(g.Enum("GroupType", "EPalGroupType", "EPalGroupType::Guild"), g.Bytes("RawData", guildRaw()))}),
			g.Struct("GameTimeSaveData", "PalGameTimeSaveData", g.Int64("RealDateTimeTicks", 5000)),
		),
	)
}

func playerSave() []byte {
	return g.Document("/Script/Pal.PalWorldPlayerSaveGame",
		g.Int("Version", 100),
		g.Struct("SaveData", "PalWorldPlayerSaveData",
			g.GUID("PlayerUId", wanderer),
			g.Names("UnlockedRecipeTechnologyNames", "Workbench", "PalBox", "Product_Axe_Grade_01"),
			g.Struct("RecordData", "PalLoggedinPlayerSaveDataRecordData",
				g.Map("TowerBossDefeatFlag", "NameProperty", "BoolProperty",
					g.Entry{Key: g.NameElem("BOSS_BATTLE_NAME_GrassBoss"), Value: g.BoolElem(true)},
					g.Entry{Key: g.NameElem("BOSS_BATTLE_NAME_ForestBoss"), Value: g.BoolElem(false)}),
				g.Map("NormalBossDefeatFlag", "NameProperty", "BoolProperty",
					g.Entry{Key: g.NameElem("81_1_grass_FBOSS_9"), Value: g.BoolElem(true)},
					g.Entry{Key: g.NameElem("81_1_grass_FBOSS_20"), Value: g.BoolElem(true)}),
				g.Int("TribeCaptureCount", 2),
				g.Map("PalCaptureCount", "NameProperty", "IntProperty",
					g.Entry{Key: g.NameElem("SheepBall"), Value: g.IntElem(3)},
					g.Entry{Key: g.NameElem("PinkCat"), Value: g.IntElem(1)}),
				g.Map("PaldeckUnlockFlag", "NameProperty", "BoolProperty",
					g.Entry{Key: g.NameElem("SheepBall"), Value: g.BoolElem(true)},
					g.Entry{Key: g.NameElem("PinkCat"), Value: g.BoolElem(true)},
					g.Entry{Key: g.NameElem("ChickenPal"), Value: g.BoolElem(true)}),
				g.Map("FastTravelPointUnlockFlag", "NameProperty", "BoolProperty",
					g.Entry{Key: g.NameElem("6E03F846"), Value: g.BoolElem(true)}),
				g.Int("NormalDungeonClearCount", 5),
				g.Int("FixedDungeonClearCount", 2),
			),
			g.DateTime("LastOnlineDateTime", savedTick),
			g.Enum("PlayerPlatform", "EPalPlayerPlatform", "EPalPlayerPlatform::Steam"),
		),
	)
}

func TestExtractReadsPlayersGuildsAndBases(t *testing.T) {
	savedAt := time.Date(2026, 9, 28, 5, 30, 0, 0, time.UTC)
	world, err := Extract(level(), map[string][]byte{wanderer: playerSave()}, savedAt)
	if err != nil {
		t.Fatal(err)
	}
	if !world.SavedAt.Equal(savedAt) {
		t.Fatalf("saved at %v", world.SavedAt)
	}
	name := func(s string) *string { return &s }
	number := func(n int) *int { return &n }
	lastOnline := Time(savedTick)
	want := []Player{
		{PlayerID: wanderer, Name: name("Wanderer"), Level: number(24), GuildID: name(guildID), LastOnlineAt: &lastOnline, Progress: &Progress{
			Palpedia: 3, SpeciesCaptured: 2, Captures: 4, TowerBosses: []string{"GrassBoss"}, FieldBosses: 2,
			DungeonClears: 5, FixedDungeonClears: 2, Technologies: 3, FastTravelPoints: 1,
		}},
		{PlayerID: fisher, Name: name("Fisher"), Level: number(7), GuildID: name(guildID)},
	}
	if !reflect.DeepEqual(world.Players, want) {
		got, _ := json.MarshalIndent(world.Players, "", " ")
		t.Fatalf("players %s", got)
	}
	wantGuilds := []Guild{{GuildID: guildID, Name: "Lark Riders", BaseCampLevel: 3, Members: []Member{
		{PlayerID: wanderer, Name: "Wanderer", Role: "guild_master"},
		{PlayerID: fisher, Name: "Fisher", Role: "member"},
	}}}
	if !reflect.DeepEqual(world.Guilds, wantGuilds) {
		t.Fatalf("guilds %+v", world.Guilds)
	}
	if len(world.Bases) != 1 {
		t.Fatalf("bases %+v", world.Bases)
	}
	base := world.Bases[0]
	if base.BaseID != baseID || *base.GuildID != guildID || *base.Name != "Hilltop" || base.X != -73080.5 || base.Y != -69035.25 || base.Z != -948.5 {
		t.Fatalf("base %+v", base)
	}
	wantWorkers := []Worker{
		{InstanceID: "21000000000000000000000000000000", CharacterID: "SheepBall", Level: 9},
		{InstanceID: "22000000000000000000000000000000", CharacterID: "BOSS_FoxMage", Level: 28, Name: name("Ember")},
	}
	if !reflect.DeepEqual(base.Workers, wantWorkers) {
		t.Fatalf("workers %+v", base.Workers)
	}
}

func TestTimeConvertsDateTimeTicks(t *testing.T) {
	got := Time(639193141775130000)
	want := time.Date(2026, 7, 10, 21, 2, 57, 513000000, time.UTC)
	if !got.Equal(want) {
		t.Fatalf("got %v want %v", got, want)
	}
}

func TestATruncatedGuildIsAnError(t *testing.T) {
	raw := guildRaw()
	if _, err := readGuild(raw[:len(raw)-40]); err == nil {
		t.Fatal("expected an error")
	}
}
