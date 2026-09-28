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
	box       = "B0C0000000000000000000000000000B"
	inventory = "1A2B000000000000000000000000000C"
	chest     = "C4E5000000000000000000000000000D"
	hatcher   = "1AC0000000000000000000000000000E"
	hatcher2  = "1AC0000000000000000000000000000F"
	eggOne    = "E6600000000000000000000000000001"
	eggTwo    = "E6600000000000000000000000000002"
	eggThree  = "E6600000000000000000000000000003"
	eggFour   = "E6600000000000000000000000000004"
	savedTick = int64(639262000000000000)
)

func eggRaw(local, itemID, character string) []byte {
	var b g.Buffer
	b.GUID("").GUID(local).String(itemID).I32(0).String(character)
	b.Write(g.Stream())
	return b.Bytes()
}

func slotRaw(index int32, itemID, local string) []byte {
	var b g.Buffer
	b.I32(index).I32(1).String(itemID).GUID("").GUID(local).I32(0)
	return b.Bytes()
}

func containerEntry(id string, slots ...[]byte) g.Entry {
	items := [][]g.Prop{}
	for _, slot := range slots {
		items = append(items, []g.Prop{g.Bytes("RawData", slot)})
	}
	return g.Entry{
		Key:   g.FieldsElem(g.GUID("ID", id)),
		Value: g.FieldsElem(g.StructArray("Slots", "PalItemSlotSaveData", items...), g.Int("SlotNum", int32(len(slots)))),
	}
}

func modelRaw(instance, base string) []byte {
	var b g.Buffer
	b.GUID(instance).GUID("").GUID(base).GUID(guildID).I32(1000).I32(1000)
	return b.Bytes()
}

func concreteRaw(stream []byte) []byte {
	var b g.Buffer
	b.GUID("").GUID("").I32(0)
	b.Write(stream)
	return b.Bytes()
}

func objectFields(id, instance, base, container string, concrete []byte) []g.Prop {
	modules := []g.Entry{}
	if container != "" {
		var raw g.Buffer
		raw.GUID(container).I32(0).I32(1)
		modules = append(modules, g.Entry{
			Key:   g.NameElem("EPalMapObjectConcreteModelModuleType::ItemContainer"),
			Value: g.FieldsElem(g.Bytes("RawData", raw.Bytes())),
		})
	}
	return []g.Prop{
		g.Name("MapObjectId", id),
		g.Struct("Model", "PalMapObjectModelSaveData", g.Bytes("RawData", modelRaw(instance, base))),
		g.Struct("ConcreteModel", "PalMapObjectConcreteModelSaveData",
			g.Map("ModuleMap", "EnumProperty", "StructProperty", modules...),
			g.Bytes("RawData", concrete)),
	}
}

func hatchedStream() []byte {
	return g.Stream(g.Struct("SaveParameter", "PalIndividualCharacterSaveParameter",
		g.Name("CharacterID", "BOSS_Kitsunebi"),
		g.Enum("Gender", "EPalGenderType", "EPalGenderType::Female"),
		g.Byte("Level", 1),
		g.Byte("Talent_HP", 50),
		g.Byte("Talent_Shot", 60),
		g.Byte("Talent_Defense", 70),
		g.Names("PassiveSkillList", "Rare"),
		g.Bool("IsRarePal", true)))
}

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
				characterEntry("", "23", characterRaw(guildID, g.Name("CharacterID", "PinkCat"), g.Enum("Gender", "EPalGenderType", "EPalGenderType::Male"), g.Byte("Level", 4), g.Byte("Talent_HP", 30), g.Byte("Talent_Shot", 40), g.Byte("Talent_Defense", 50), g.Names("PassiveSkillList", "Noukin", "None"), slot(party, 0))),
				characterEntry("", "24", characterRaw(guildID, g.Name("CharacterID", "BOSS_Kitsunebi"), g.Enum("Gender", "EPalGenderType", "EPalGenderType::Female"), g.Byte("Level", 12), g.Int("Rank", 2), g.Byte("Talent_HP", 90), g.Byte("Talent_Shot", 95), g.Byte("Talent_Defense", 100), g.Names("PassiveSkillList", "Rare", "Noukin"), g.Bool("IsRarePal", true), g.Str("NickName", "Blaze"), slot(box, 3))),
				characterEntry("", "25", characterRaw(guildID, g.Name("CharacterID", "SheepBall"), g.Byte("Level", 2), slot("D00D000000000000000000000000000D", 0))),
			),
			g.StructArray("MapObjectSaveData", "PalMapObjectSaveData",
				objectFields("HatchingPalEgg", "0B1E000000000000000000000000000A", baseID, hatcher, concreteRaw(g.Stream())),
				objectFields("HatchingPalEgg", "0B1E000000000000000000000000000B", baseID, hatcher2, concreteRaw(hatchedStream())),
				objectFields("ItemChest", "0B1E000000000000000000000000000C", baseID, chest, []byte{}),
				objectFields("ItemChest", "0B1E000000000000000000000000000D", "0BA5E000000000000000000000000005", inventory, []byte{}),
			),
			g.Map("ItemContainerSaveData", "StructProperty", "StructProperty",
				containerEntry(inventory, slotRaw(0, "PalEgg_Fire_01", eggOne), slotRaw(1, "Stone", "")),
				containerEntry(hatcher, slotRaw(0, "PalEgg_Leaf_05", eggTwo)),
				containerEntry(hatcher2, slotRaw(0, "PalEgg_Fire_02", eggFour)),
				containerEntry(chest, slotRaw(3, "PalEgg_Dark_03", eggThree)),
			),
			g.StructArray("DynamicItemSaveData", "PalDynamicItemSaveData",
				[]g.Prop{g.Bytes("RawData", eggRaw(eggOne, "PalEgg_Fire_01", "Kitsunebi"))},
				[]g.Prop{g.Bytes("RawData", eggRaw(eggTwo, "PalEgg_Leaf_05", "BOSS_GrassMammoth"))},
				[]g.Prop{g.Bytes("RawData", eggRaw(eggThree, "PalEgg_Dark_03", "NightFox"))},
				[]g.Prop{g.Bytes("RawData", eggRaw(eggFour, "PalEgg_Fire_02", "Kitsunebi"))},
				[]g.Prop{g.Bytes("RawData", []byte{0, 0, 0, 0})},
			),
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
			g.Struct("PalStorageContainerId", "PalContainerId", g.GUID("ID", box)),
			g.Struct("OtomoCharacterContainerId", "PalContainerId", g.GUID("ID", party)),
			g.Struct("InventoryInfo", "PalPlayerDataInventoryInfo",
				g.Struct("CommonContainerId", "PalContainerId", g.GUID("ID", inventory)),
				g.Struct("EssentialContainerId", "PalContainerId", g.GUID("ID", ""))),
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
	male := "male"
	female := "female"
	want := []Player{
		{PlayerID: wanderer, Name: name("Wanderer"), Level: number(24), GuildID: name(guildID), LastOnlineAt: &lastOnline, Progress: &Progress{
			Palpedia: 3, PalpediaEntries: []string{"ChickenPal", "PinkCat", "SheepBall"}, SpeciesCaptured: 2, Captures: 4,
			SpeciesCaptures: map[string]int{"PinkCat": 1, "SheepBall": 3}, TowerBosses: []string{"GrassBoss"}, FieldBosses: 2,
			DungeonClears: 5, FixedDungeonClears: 2, Technologies: 3, FastTravelPoints: 1,
		}, Pals: []Pal{
			{InstanceID: "23000000000000000000000000000000", Species: "PinkCat", Where: "party", Gender: &male, Level: 4, Rank: 1, Talents: Talents{HP: 30, Shot: 40, Defense: 50}, Passives: []string{"Noukin"}},
			{InstanceID: "24000000000000000000000000000000", Species: "Kitsunebi", Alpha: true, Where: "box", Gender: &female, Level: 12, Rank: 2, Talents: Talents{HP: 90, Shot: 95, Defense: 100}, Passives: []string{"Rare", "Noukin"}, Lucky: true, Name: name("Blaze")},
		}, Eggs: []Egg{{EggID: eggOne, ItemID: "PalEgg_Fire_01", Species: "Kitsunebi"}}},
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
	wantEggs := []Egg{{EggID: eggThree, ItemID: "PalEgg_Dark_03", Species: "NightFox"}}
	if !reflect.DeepEqual(base.Eggs, wantEggs) {
		t.Fatalf("base eggs %+v", base.Eggs)
	}
	wantIncubators := []Incubator{
		{ObjectID: "0B1E000000000000000000000000000A", Kind: "HatchingPalEgg", Eggs: []Egg{{EggID: eggTwo, ItemID: "PalEgg_Leaf_05", Species: "GrassMammoth", Alpha: true}}},
		{ObjectID: "0B1E000000000000000000000000000B", Kind: "HatchingPalEgg", Eggs: []Egg{{EggID: eggFour, ItemID: "PalEgg_Fire_02", Species: "Kitsunebi"}}, Hatched: &Pal{
			InstanceID: "0B1E000000000000000000000000000B", Species: "Kitsunebi", Alpha: true, Where: "incubator", Gender: &female, Level: 1, Rank: 1,
			Talents: Talents{HP: 50, Shot: 60, Defense: 70}, Passives: []string{"Rare"}, Lucky: true,
		}},
	}
	if !reflect.DeepEqual(base.Incubators, wantIncubators) {
		got, _ := json.MarshalIndent(base.Incubators, "", " ")
		t.Fatalf("incubators %s", got)
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
