package palworld

import (
	"sort"
	"strings"

	"github.com/oddessentials/skylark/savereader/internal/gvas"
)

type Pal struct {
	InstanceID string   `json:"instance_id"`
	Species    string   `json:"species"`
	Alpha      bool     `json:"alpha"`
	Where      string   `json:"where"`
	Gender     *string  `json:"gender"`
	Level      int      `json:"level"`
	Rank       int      `json:"rank"`
	Talents    Talents  `json:"talents"`
	Passives   []string `json:"passives"`
	Lucky      bool     `json:"lucky"`
	Name       *string  `json:"name"`
}

type Talents struct {
	HP      int `json:"hp"`
	Shot    int `json:"shot"`
	Defense int `json:"defense"`
}

type Egg struct {
	EggID   string `json:"egg_id"`
	ItemID  string `json:"item_id"`
	Species string `json:"species"`
	Alpha   bool   `json:"alpha"`
}

type Incubator struct {
	ObjectID string `json:"object_id"`
	Kind     string `json:"kind"`
	Eggs     []Egg  `json:"eggs"`
	Hatched  *Pal   `json:"hatched"`
}

const (
	WhereBox       = "box"
	WhereParty     = "party"
	WhereIncubator = "incubator"

	alphaPrefix     = "BOSS_"
	eggItemPrefix   = "PalEgg"
	incubatorMarker = "HatchingPalEgg"
	itemModule      = "ItemContainer"
	hatchedOffset   = 36
	modelBaseOffset = 32
)

type slotItem struct {
	itemID  string
	localID gvas.GUID
}

type mapObject struct {
	id        string
	instance  gvas.GUID
	base      gvas.GUID
	container gvas.GUID
	concrete  []byte
}

type playerContainers struct {
	box       gvas.GUID
	party     gvas.GUID
	inventory []gvas.GUID
}

func speciesOf(characterID string) (string, bool) {
	if len(characterID) > len(alphaPrefix) && strings.EqualFold(characterID[:len(alphaPrefix)], alphaPrefix) {
		return characterID[len(alphaPrefix):], true
	}
	return characterID, false
}

func genderOf(value string) *string {
	var gender string
	switch gvas.EnumValue(value) {
	case "Male":
		gender = "male"
	case "Female":
		gender = "female"
	default:
		return nil
	}
	return &gender
}

func readPal(save gvas.Properties, instance, where string) Pal {
	id, _ := save.String("CharacterID")
	species, alpha := speciesOf(id)
	pal := Pal{InstanceID: instance, Species: species, Alpha: alpha, Where: where, Level: 1, Rank: 1, Passives: []string{}}
	gender, _ := save.String("Gender")
	pal.Gender = genderOf(gender)
	if level, ok := save.Int("Level"); ok {
		pal.Level = int(level)
	}
	if rank, ok := save.Int("Rank"); ok {
		pal.Rank = int(rank)
	}
	if hp, ok := save.Int("Talent_HP"); ok {
		pal.Talents.HP = int(hp)
	}
	if shot, ok := save.Int("Talent_Shot"); ok {
		pal.Talents.Shot = int(shot)
	}
	if defense, ok := save.Int("Talent_Defense"); ok {
		pal.Talents.Defense = int(defense)
	}
	for _, entry := range save.Array("PassiveSkillList") {
		if passive, ok := entry.(string); ok && passive != "" && passive != "None" {
			pal.Passives = append(pal.Passives, passive)
		}
	}
	pal.Lucky = save.Bool("IsRarePal")
	if name, ok := save.String("NickName"); ok && name != "" {
		pal.Name = &name
	}
	return pal
}

func readPlayerContainers(save gvas.Properties) playerContainers {
	containers := playerContainers{}
	containers.box, _ = save.Fields("PalStorageContainerId").GUID("ID")
	containers.party, _ = save.Fields("OtomoCharacterContainerId").GUID("ID")
	for _, field := range save.Fields("InventoryInfo") {
		fields, _ := field.Value.(gvas.Struct)
		if id, ok := fields.Fields.GUID("ID"); ok && id != gvas.ZeroGUID {
			containers.inventory = append(containers.inventory, id)
		}
	}
	return containers
}

func readDynamicEggs(items []any) map[gvas.GUID]Egg {
	eggs := map[gvas.GUID]Egg{}
	for _, item := range items {
		record, _ := item.(gvas.Struct)
		raw := record.Fields.Bytes("RawData")
		if len(raw) < 40 {
			continue
		}
		b := &blob{data: raw, pos: 16}
		local, err := b.guid()
		if err != nil {
			continue
		}
		itemID, err := b.fstring()
		if err != nil || !strings.HasPrefix(itemID, eggItemPrefix) {
			continue
		}
		if _, err := b.i32(); err != nil {
			continue
		}
		characterID, err := b.fstring()
		if err != nil || characterID == "" {
			continue
		}
		species, alpha := speciesOf(characterID)
		eggs[local] = Egg{EggID: string(local), ItemID: itemID, Species: species, Alpha: alpha}
	}
	return eggs
}

func readSlot(raw []byte) (slotItem, bool) {
	b := &blob{data: raw}
	if _, err := b.i32(); err != nil {
		return slotItem{}, false
	}
	if _, err := b.i32(); err != nil {
		return slotItem{}, false
	}
	itemID, err := b.fstring()
	if err != nil || !strings.HasPrefix(itemID, eggItemPrefix) {
		return slotItem{}, false
	}
	if err := b.skip(16); err != nil {
		return slotItem{}, false
	}
	local, err := b.guid()
	if err != nil {
		return slotItem{}, false
	}
	return slotItem{itemID: itemID, localID: local}, true
}

func readContainers(entries []gvas.MapEntry) map[gvas.GUID][]slotItem {
	containers := map[gvas.GUID][]slotItem{}
	for _, entry := range entries {
		key, _ := entry.Key.(gvas.Properties)
		id, ok := key.GUID("ID")
		if !ok {
			continue
		}
		fields, _ := entry.Value.(gvas.Properties)
		var slots []slotItem
		for _, item := range fields.Array("Slots") {
			record, _ := item.(gvas.Struct)
			if slot, ok := readSlot(record.Fields.Bytes("RawData")); ok {
				slots = append(slots, slot)
			}
		}
		if len(slots) > 0 {
			containers[id] = slots
		}
	}
	return containers
}

func readMapObjects(items []any) []mapObject {
	var objects []mapObject
	for _, item := range items {
		record, _ := item.(gvas.Struct)
		id, _ := record.Fields.String("MapObjectId")
		model := record.Fields.Fields("Model").Bytes("RawData")
		if id == "" || len(model) < modelBaseOffset+16 {
			continue
		}
		object := mapObject{id: id, instance: guidAt(model, 0), base: guidAt(model, modelBaseOffset)}
		concrete := record.Fields.Fields("ConcreteModel")
		object.concrete = concrete.Bytes("RawData")
		for _, module := range concrete.Map("ModuleMap") {
			kind, _ := module.Key.(string)
			if !strings.HasSuffix(kind, itemModule) {
				continue
			}
			fields, _ := module.Value.(gvas.Properties)
			if raw := fields.Bytes("RawData"); len(raw) >= 16 {
				object.container = guidAt(raw, 0)
			}
		}
		if object.base == gvas.ZeroGUID {
			continue
		}
		objects = append(objects, object)
	}
	return objects
}

type eggFinder struct {
	containers map[gvas.GUID][]slotItem
	eggs       map[gvas.GUID]Egg
}

func (f eggFinder) in(container gvas.GUID) []Egg {
	var found []Egg
	for _, slot := range f.containers[container] {
		if egg, ok := f.eggs[slot.localID]; ok {
			found = append(found, egg)
		}
	}
	return found
}

func hatchedIn(raw []byte, instance string) *Pal {
	if len(raw) < hatchedOffset+4 {
		return nil
	}
	props, _, err := gvas.ParseProperties(raw[hatchedOffset:], gvas.Options{})
	if err != nil {
		return nil
	}
	save := props.Fields("SaveParameter")
	if id, ok := save.String("CharacterID"); !ok || id == "" {
		return nil
	}
	pal := readPal(save, instance, WhereIncubator)
	return &pal
}

func sortEggs(eggs []Egg) []Egg {
	if eggs == nil {
		return []Egg{}
	}
	sort.Slice(eggs, func(i, j int) bool { return eggs[i].EggID < eggs[j].EggID })
	return eggs
}

func baseEggs(objects []mapObject, base gvas.GUID, finder eggFinder) ([]Egg, []Incubator) {
	var eggs []Egg
	incubators := []Incubator{}
	for _, object := range objects {
		if object.base != base {
			continue
		}
		if strings.Contains(object.id, incubatorMarker) {
			incubators = append(incubators, Incubator{
				ObjectID: string(object.instance),
				Kind:     object.id,
				Eggs:     sortEggs(finder.in(object.container)),
				Hatched:  hatchedIn(object.concrete, string(object.instance)),
			})
			continue
		}
		if object.container != "" {
			eggs = append(eggs, finder.in(object.container)...)
		}
	}
	sort.Slice(incubators, func(i, j int) bool { return incubators[i].ObjectID < incubators[j].ObjectID })
	return sortEggs(eggs), incubators
}

func playerPals(characters []character, containers playerContainers) []Pal {
	pals := []Pal{}
	for _, c := range characters {
		if c.isPlayer || c.id == "" {
			continue
		}
		where := ""
		switch {
		case containers.box != "" && c.container == containers.box:
			where = WhereBox
		case containers.party != "" && c.container == containers.party:
			where = WhereParty
		default:
			continue
		}
		pal := readPal(c.save, string(c.instance), where)
		pals = append(pals, pal)
	}
	sort.Slice(pals, func(i, j int) bool { return pals[i].InstanceID < pals[j].InstanceID })
	return pals
}

func playerEggs(containers playerContainers, finder eggFinder) []Egg {
	var eggs []Egg
	for _, id := range containers.inventory {
		eggs = append(eggs, finder.in(id)...)
	}
	return sortEggs(eggs)
}
