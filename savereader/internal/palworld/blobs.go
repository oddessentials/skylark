package palworld

import (
	"fmt"
	"math"
	"sort"

	"github.com/oddessentials/skylark/savereader/internal/gvas"
)

type Lab struct {
	Current  *string    `json:"current"`
	Research []Research `json:"research"`
}

type Research struct {
	ID   string  `json:"id"`
	Work float64 `json:"work"`
}

const noResearch = "None"

const (
	transformSize        = 80
	workerContainerStart = 16 + transformSize + 2
)

func readGuild(raw []byte) (Guild, error) {
	b := &blob{data: raw}
	guild := Guild{Members: []Member{}}
	id, err := b.guid()
	if err != nil {
		return guild, err
	}
	guild.GuildID = string(id)
	if _, err := b.fstring(); err != nil {
		return guild, err
	}
	handles, err := b.count(1 << 20)
	if err != nil {
		return guild, err
	}
	if err := b.skip(handles * 32); err != nil {
		return guild, err
	}
	if _, err := b.u8(); err != nil {
		return guild, err
	}
	if _, err := b.i32(); err != nil {
		return guild, err
	}
	if err := b.guids(); err != nil {
		return guild, err
	}
	if _, err := b.i32(); err != nil {
		return guild, err
	}
	level, err := b.i32()
	if err != nil {
		return guild, err
	}
	guild.BaseCampLevel = int(level)
	if err := b.guids(); err != nil {
		return guild, err
	}
	if guild.Name, err = b.fstring(); err != nil {
		return guild, err
	}
	if _, err := b.guid(); err != nil {
		return guild, err
	}
	if _, err := b.i32(); err != nil {
		return guild, err
	}
	flags, err := b.count(1 << 10)
	if err != nil {
		return guild, err
	}
	if err := b.skip(flags); err != nil {
		return guild, err
	}
	if _, err := b.i32(); err != nil {
		return guild, err
	}
	if _, err := b.guid(); err != nil {
		return guild, err
	}
	members, err := b.count(1 << 12)
	if err != nil {
		return guild, err
	}
	for range members {
		uid, err := b.guid()
		if err != nil {
			return guild, err
		}
		if err := b.skip(8); err != nil {
			return guild, err
		}
		name, err := b.fstring()
		if err != nil {
			return guild, err
		}
		role, err := b.u8()
		if err != nil {
			return guild, err
		}
		label, ok := roles[role]
		if !ok {
			label = fmt.Sprintf("role_%d", role)
		}
		guild.Members = append(guild.Members, Member{PlayerID: string(uid), Name: name, Role: label})
	}
	return guild, nil
}

func (b *blob) guids() error {
	n, err := b.count(1 << 16)
	if err != nil {
		return err
	}
	return b.skip(n * 16)
}

func readBase(fields gvas.Properties) (Base, gvas.GUID, error) {
	b := &blob{data: fields.Bytes("RawData")}
	base := Base{Workers: []Worker{}}
	id, err := b.guid()
	if err != nil {
		return base, "", err
	}
	base.BaseID = string(id)
	name, err := b.fstring()
	if err != nil {
		return base, "", err
	}
	if name != "" {
		base.Name = &name
	}
	if _, err := b.u8(); err != nil {
		return base, "", err
	}
	if err := b.skip(32); err != nil {
		return base, "", err
	}
	if base.X, err = b.f64(); err != nil {
		return base, "", err
	}
	if base.Y, err = b.f64(); err != nil {
		return base, "", err
	}
	if base.Z, err = b.f64(); err != nil {
		return base, "", err
	}
	if err := b.skip(24); err != nil {
		return base, "", err
	}
	if _, err := b.f32(); err != nil {
		return base, "", err
	}
	group, err := b.guid()
	if err != nil {
		return base, "", err
	}
	if group != gvas.ZeroGUID {
		value := string(group)
		base.GuildID = &value
	}
	director := fields.Fields("WorkerDirector").Bytes("RawData")
	if len(director) < workerContainerStart+16 || guidAt(director, 0) != id {
		return base, "", nil
	}
	return base, guidAt(director, workerContainerStart), nil
}

func readLab(raw []byte) (*Lab, error) {
	b := &blob{data: raw}
	n, err := b.count(1 << 16)
	if err != nil {
		return nil, err
	}
	lab := &Lab{Research: []Research{}}
	for range n {
		id, err := b.fstring()
		if err != nil {
			return nil, err
		}
		work, err := b.f32()
		if err != nil {
			return nil, err
		}
		if work > 0 && id != "" {
			lab.Research = append(lab.Research, Research{ID: id, Work: math.Round(float64(work)*10) / 10})
		}
	}
	current, err := b.fstring()
	if err != nil {
		return nil, err
	}
	if current != "" && current != noResearch {
		lab.Current = &current
	}
	sort.Slice(lab.Research, func(i, j int) bool { return lab.Research[i].ID < lab.Research[j].ID })
	return lab, nil
}

func readLabs(entries []gvas.MapEntry) (map[gvas.GUID]*Lab, error) {
	labs := map[gvas.GUID]*Lab{}
	for _, entry := range entries {
		id, ok := entry.Key.(gvas.GUID)
		if !ok {
			continue
		}
		fields, _ := entry.Value.(gvas.Properties)
		raw := fields.Fields("Lab").Bytes("RawData")
		if len(raw) < 4 {
			continue
		}
		lab, err := readLab(raw)
		if err != nil {
			return nil, fmt.Errorf("guild %s lab: %w", id, err)
		}
		labs[id] = lab
	}
	return labs, nil
}
