package palworld

import (
	"encoding/binary"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unicode/utf16"

	"github.com/oddessentials/skylark/savereader/internal/gvas"
	"github.com/oddessentials/skylark/savereader/internal/savefile"
)

type World struct {
	SavedAt time.Time `json:"saved_at"`
	Players []Player  `json:"players"`
	Guilds  []Guild   `json:"guilds"`
	Bases   []Base    `json:"bases"`
}

type Player struct {
	PlayerID     string     `json:"player_id"`
	Name         *string    `json:"name"`
	Level        *int       `json:"level"`
	GuildID      *string    `json:"guild_id"`
	LastOnlineAt *time.Time `json:"last_online_at"`
	Progress     *Progress  `json:"progress"`
}

type Progress struct {
	Palpedia           int            `json:"palpedia"`
	PalpediaEntries    []string       `json:"palpedia_entries"`
	SpeciesCaptured    int            `json:"species_captured"`
	Captures           int            `json:"captures"`
	SpeciesCaptures    map[string]int `json:"species_captures"`
	TowerBosses        []string       `json:"tower_bosses"`
	FieldBosses        int            `json:"field_bosses"`
	DungeonClears      int            `json:"dungeon_clears"`
	FixedDungeonClears int            `json:"fixed_dungeon_clears"`
	Technologies       int            `json:"technologies"`
	FastTravelPoints   int            `json:"fast_travel_points"`
}

type Guild struct {
	GuildID       string   `json:"guild_id"`
	Name          string   `json:"name"`
	BaseCampLevel int      `json:"base_camp_level"`
	Members       []Member `json:"members"`
}

type Member struct {
	PlayerID string `json:"player_id"`
	Name     string `json:"name"`
	Role     string `json:"role"`
}

type Base struct {
	BaseID  string   `json:"base_id"`
	GuildID *string  `json:"guild_id"`
	Name    *string  `json:"name"`
	X       float64  `json:"x"`
	Y       float64  `json:"y"`
	Z       float64  `json:"z"`
	Workers []Worker `json:"workers"`
}

type Worker struct {
	InstanceID  string  `json:"instance_id"`
	CharacterID string  `json:"character_id"`
	Level       int     `json:"level"`
	Name        *string `json:"name"`
}

var roles = map[byte]string{0: "none", 1: "guild_master", 2: "sub_master", 3: "member", 4: "guest"}

var levelParts = map[string]bool{
	"worldSaveData": true,
	"worldSaveData.CharacterSaveParameterMap": true,
	"worldSaveData.BaseCampSaveData":          true,
	"worldSaveData.GroupSaveDataMap":          true,
}

func levelOptions() gvas.Options {
	return gvas.Options{
		Skip: func(path string) bool {
			if levelParts[path] {
				return false
			}
			for part := range levelParts {
				if strings.HasPrefix(path, part+".") {
					return false
				}
			}
			return true
		},
		Struct: func(path string) gvas.StructKind {
			switch path {
			case "worldSaveData.GroupSaveDataMap.Key", "worldSaveData.BaseCampSaveData.Key":
				return gvas.GUIDStruct
			case "worldSaveData.CharacterSaveParameterMap.Key",
				"worldSaveData.CharacterSaveParameterMap.Value",
				"worldSaveData.GroupSaveDataMap.Value",
				"worldSaveData.BaseCampSaveData.Value":
				return gvas.PropertyStruct
			}
			return gvas.GuessStruct
		},
	}
}

type character struct {
	playerID  gvas.GUID
	instance  gvas.GUID
	isPlayer  bool
	id        string
	name      string
	level     int
	container gvas.GUID
	group     gvas.GUID
}

func Extract(level []byte, players map[string][]byte, savedAt time.Time) (*World, error) {
	doc, err := gvas.Parse(level, levelOptions())
	if err != nil {
		return nil, fmt.Errorf("Level.sav: %w", err)
	}
	world := doc.Properties.Fields("worldSaveData")
	if world == nil {
		return nil, errors.New("Level.sav has no worldSaveData")
	}
	characters, err := readCharacters(world.Map("CharacterSaveParameterMap"))
	if err != nil {
		return nil, err
	}
	out := &World{SavedAt: savedAt.UTC(), Players: []Player{}, Guilds: []Guild{}, Bases: []Base{}}
	for _, entry := range world.Map("GroupSaveDataMap") {
		fields, _ := entry.Value.(gvas.Properties)
		kind, _ := fields.String("GroupType")
		if gvas.EnumValue(kind) != "Guild" {
			continue
		}
		guild, err := readGuild(fields.Bytes("RawData"))
		if err != nil {
			return nil, fmt.Errorf("guild %v: %w", entry.Key, err)
		}
		out.Guilds = append(out.Guilds, guild)
	}
	for _, entry := range world.Map("BaseCampSaveData") {
		fields, _ := entry.Value.(gvas.Properties)
		base, container, err := readBase(fields)
		if err != nil {
			return nil, fmt.Errorf("base %v: %w", entry.Key, err)
		}
		base.Workers = workersIn(characters, container)
		out.Bases = append(out.Bases, base)
	}
	byUID := map[gvas.GUID]*character{}
	for i := range characters {
		c := &characters[i]
		if c.isPlayer {
			byUID[c.playerID] = c
		}
	}
	uids := make([]string, 0, len(players))
	for uid := range players {
		uids = append(uids, uid)
	}
	for _, c := range characters {
		if c.isPlayer && players[string(c.playerID)] == nil {
			uids = append(uids, string(c.playerID))
		}
	}
	sort.Strings(uids)
	seen := map[string]bool{}
	for _, uid := range uids {
		if seen[uid] {
			continue
		}
		seen[uid] = true
		player := Player{PlayerID: uid}
		if c := byUID[gvas.GUID(uid)]; c != nil {
			if c.name != "" {
				player.Name = &c.name
			}
			level := c.level
			player.Level = &level
			if c.group != "" && c.group != gvas.ZeroGUID {
				group := string(c.group)
				player.GuildID = &group
			}
		}
		if data := players[uid]; data != nil {
			lastOnline, progress, err := readPlayer(data)
			if err != nil {
				return nil, fmt.Errorf("player %s: %w", uid, err)
			}
			player.LastOnlineAt = lastOnline
			player.Progress = progress
		}
		out.Players = append(out.Players, player)
	}
	return out, nil
}

func readCharacters(entries []gvas.MapEntry) ([]character, error) {
	characters := make([]character, 0, len(entries))
	for _, entry := range entries {
		key, _ := entry.Key.(gvas.Properties)
		value, _ := entry.Value.(gvas.Properties)
		raw := value.Bytes("RawData")
		if raw == nil {
			continue
		}
		props, consumed, err := gvas.ParseProperties(raw, gvas.Options{})
		if err != nil {
			return nil, fmt.Errorf("character data: %w", err)
		}
		c := character{}
		c.playerID, _ = key.GUID("PlayerUId")
		c.instance, _ = key.GUID("InstanceId")
		save := props.Fields("SaveParameter")
		c.isPlayer = save.Bool("IsPlayer")
		c.id, _ = save.String("CharacterID")
		c.name, _ = save.String("NickName")
		if level, ok := save.Int("Level"); ok {
			c.level = int(level)
		} else {
			c.level = 1
		}
		c.container, _ = save.Fields("SlotId").GUID("ContainerId")
		if rest := raw[consumed:]; len(rest) >= 20 {
			c.group = guidAt(rest, 4)
		}
		characters = append(characters, c)
	}
	return characters, nil
}

func workersIn(characters []character, container gvas.GUID) []Worker {
	workers := []Worker{}
	if container == "" || container == gvas.ZeroGUID {
		return workers
	}
	for _, c := range characters {
		if c.isPlayer || c.container != container || c.id == "" {
			continue
		}
		worker := Worker{InstanceID: string(c.instance), CharacterID: c.id, Level: c.level}
		if c.name != "" {
			name := c.name
			worker.Name = &name
		}
		workers = append(workers, worker)
	}
	sort.Slice(workers, func(i, j int) bool { return workers[i].InstanceID < workers[j].InstanceID })
	return workers
}

func readPlayer(data []byte) (*time.Time, *Progress, error) {
	doc, err := gvas.Parse(data, gvas.Options{})
	if err != nil {
		return nil, nil, err
	}
	save := doc.Properties.Fields("SaveData")
	var lastOnline *time.Time
	if ticks, ok := save.DateTime("LastOnlineDateTime"); ok && ticks > 0 {
		at := Time(int64(ticks))
		lastOnline = &at
	}
	record := save.Fields("RecordData")
	progress := &Progress{PalpediaEntries: []string{}, SpeciesCaptures: map[string]int{}, TowerBosses: []string{}}
	for _, entry := range record.Map("PaldeckUnlockFlag") {
		name, _ := entry.Key.(string)
		if done, _ := entry.Value.(bool); done && name != "" {
			progress.PalpediaEntries = append(progress.PalpediaEntries, name)
		}
	}
	sort.Strings(progress.PalpediaEntries)
	progress.Palpedia = len(progress.PalpediaEntries)
	for _, entry := range record.Map("PalCaptureCount") {
		name, _ := entry.Key.(string)
		if count, ok := entry.Value.(int64); ok && count > 0 && name != "" {
			progress.SpeciesCaptured++
			progress.Captures += int(count)
			progress.SpeciesCaptures[name] = int(count)
		}
	}
	for _, entry := range record.Map("TowerBossDefeatFlag") {
		name, _ := entry.Key.(string)
		if done, _ := entry.Value.(bool); done && name != "" {
			progress.TowerBosses = append(progress.TowerBosses, strings.TrimPrefix(name, "BOSS_BATTLE_NAME_"))
		}
	}
	sort.Strings(progress.TowerBosses)
	progress.FieldBosses = countTrue(record.Map("NormalBossDefeatFlag"))
	if n, ok := record.Int("NormalDungeonClearCount"); ok {
		progress.DungeonClears = int(n)
	}
	if n, ok := record.Int("FixedDungeonClearCount"); ok {
		progress.FixedDungeonClears = int(n)
	}
	progress.FastTravelPoints = countTrue(record.Map("FastTravelPointUnlockFlag"))
	progress.Technologies = len(save.Array("UnlockedRecipeTechnologyNames"))
	return lastOnline, progress, nil
}

func countTrue(entries []gvas.MapEntry) int {
	n := 0
	for _, entry := range entries {
		if done, _ := entry.Value.(bool); done {
			n++
		}
	}
	return n
}

const ticksPerSecond = 10_000_000

var unixTicks = int64(621355968000000000)

func Time(ticks int64) time.Time {
	elapsed := ticks - unixTicks
	return time.Unix(elapsed/ticksPerSecond, (elapsed%ticksPerSecond)*100).UTC()
}

type blob struct {
	data []byte
	pos  int
}

func (b *blob) need(n int) error {
	if n < 0 || b.pos+n > len(b.data) {
		return fmt.Errorf("the data ends at byte %d, needed %d more", len(b.data), b.pos+n-len(b.data))
	}
	return nil
}

func (b *blob) u8() (byte, error) {
	if err := b.need(1); err != nil {
		return 0, err
	}
	b.pos++
	return b.data[b.pos-1], nil
}

func (b *blob) i32() (int32, error) {
	if err := b.need(4); err != nil {
		return 0, err
	}
	b.pos += 4
	return int32(binary.LittleEndian.Uint32(b.data[b.pos-4:])), nil
}

func (b *blob) f32() (float32, error) {
	v, err := b.i32()
	return math.Float32frombits(uint32(v)), err
}

func (b *blob) f64() (float64, error) {
	if err := b.need(8); err != nil {
		return 0, err
	}
	b.pos += 8
	return math.Float64frombits(binary.LittleEndian.Uint64(b.data[b.pos-8:])), nil
}

func (b *blob) skip(n int) error {
	if err := b.need(n); err != nil {
		return err
	}
	b.pos += n
	return nil
}

func (b *blob) guid() (gvas.GUID, error) {
	if err := b.need(16); err != nil {
		return "", err
	}
	b.pos += 16
	return guidAt(b.data, b.pos-16), nil
}

func (b *blob) count(limit int) (int, error) {
	n, err := b.i32()
	if err != nil {
		return 0, err
	}
	if n < 0 || int(n) > limit {
		return 0, fmt.Errorf("a count of %d at byte %d is out of range", n, b.pos-4)
	}
	return int(n), nil
}

func (b *blob) fstring() (string, error) {
	n, err := b.i32()
	if err != nil {
		return "", err
	}
	switch {
	case n == 0:
		return "", nil
	case n > 0:
		if err := b.need(int(n)); err != nil {
			return "", err
		}
		text := string(b.data[b.pos : b.pos+int(n)-1])
		b.pos += int(n)
		return text, nil
	default:
		units := int(-n)
		if err := b.need(units * 2); err != nil {
			return "", err
		}
		decoded := make([]uint16, units-1)
		for i := range decoded {
			decoded[i] = binary.LittleEndian.Uint16(b.data[b.pos+i*2:])
		}
		b.pos += units * 2
		return string(utf16.Decode(decoded)), nil
	}
}

func guidAt(data []byte, at int) gvas.GUID {
	return gvas.GUID(fmt.Sprintf("%08X%08X%08X%08X",
		binary.LittleEndian.Uint32(data[at:]),
		binary.LittleEndian.Uint32(data[at+4:]),
		binary.LittleEndian.Uint32(data[at+8:]),
		binary.LittleEndian.Uint32(data[at+12:])))
}

func ReadDir(dir string, decoder savefile.Decoder) (*World, error) {
	levelPath := filepath.Join(dir, "Level.sav")
	info, err := os.Stat(levelPath)
	if err != nil {
		return nil, err
	}
	level, err := load(levelPath, decoder)
	if err != nil {
		return nil, fmt.Errorf("Level.sav: %w", err)
	}
	players := map[string][]byte{}
	files, err := filepath.Glob(filepath.Join(dir, "Players", "*.sav"))
	if err != nil {
		return nil, err
	}
	for _, file := range files {
		uid := strings.TrimSuffix(filepath.Base(file), ".sav")
		if len(uid) != 32 {
			continue
		}
		data, err := load(file, decoder)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", filepath.Base(file), err)
		}
		players[strings.ToUpper(uid)] = data
	}
	return Extract(level, players, info.ModTime())
}

func load(path string, decoder savefile.Decoder) ([]byte, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return savefile.Decode(data, decoder)
}
