package saves

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/oddessentials/skylark/collector/internal/event"
)

const (
	Format      = 1
	maxOutput   = 64 << 20
	maxStderr   = 4 << 10
	ReadTimeout = 3 * time.Minute
)

type Result struct {
	SavedAt time.Time
	Players []event.SavePlayerData
	Guilds  []event.SaveGuildData
	Bases   []event.SaveBaseData
}

type output struct {
	Format  int       `json:"format"`
	SavedAt time.Time `json:"saved_at"`
	Players []struct {
		PlayerID     string              `json:"player_id"`
		Name         *string             `json:"name"`
		Level        *int                `json:"level"`
		GuildID      *string             `json:"guild_id"`
		LastOnlineAt *time.Time          `json:"last_online_at"`
		Progress     *event.SaveProgress `json:"progress"`
	} `json:"players"`
	Guilds []struct {
		GuildID       string                  `json:"guild_id"`
		Name          string                  `json:"name"`
		BaseCampLevel int                     `json:"base_camp_level"`
		Members       []event.SaveGuildMember `json:"members"`
	} `json:"guilds"`
	Bases []struct {
		BaseID  string             `json:"base_id"`
		GuildID *string            `json:"guild_id"`
		Name    *string            `json:"name"`
		X       float64            `json:"x"`
		Y       float64            `json:"y"`
		Z       float64            `json:"z"`
		Workers []event.SaveWorker `json:"workers"`
	} `json:"bases"`
}

func Locate(roots []string, worldGUID string) (string, bool) {
	for _, root := range roots {
		candidates := []string{root}
		if worldGUID != "" {
			candidates = append(candidates, filepath.Join(root, worldGUID), filepath.Join(root, "SaveGames", "0", worldGUID))
		}
		for _, candidate := range candidates {
			if info, err := os.Stat(filepath.Join(candidate, "Level.sav")); err == nil && !info.IsDir() {
				return candidate, true
			}
		}
	}
	return "", false
}

func Modified(dir string) (time.Time, error) {
	info, err := os.Stat(filepath.Join(dir, "Level.sav"))
	if err != nil {
		return time.Time{}, err
	}
	return info.ModTime(), nil
}

type limited struct {
	bytes.Buffer
	limit    int
	overflow bool
}

func (l *limited) Write(p []byte) (int, error) {
	if l.Len()+len(p) > l.limit {
		l.overflow = true
		p = p[:max(0, l.limit-l.Len())]
	}
	l.Buffer.Write(p)
	return len(p), nil
}

func Read(ctx context.Context, reader, dir string) (*Result, error) {
	ctx, cancel := context.WithTimeout(ctx, ReadTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, reader, "read", dir)
	stdout := &limited{limit: maxOutput}
	stderr := &limited{limit: maxStderr}
	cmd.Stdout = stdout
	cmd.Stderr = stderr
	if err := cmd.Run(); err != nil {
		if message := strings.TrimSpace(stderr.String()); message != "" {
			return nil, fmt.Errorf("%w: %s", err, message)
		}
		return nil, err
	}
	if stdout.overflow {
		return nil, fmt.Errorf("the save reader printed more than %d MB", maxOutput>>20)
	}
	var out output
	if err := json.Unmarshal(stdout.Bytes(), &out); err != nil {
		return nil, fmt.Errorf("reading the save reader's output: %w", err)
	}
	if out.Format != Format {
		return nil, fmt.Errorf("the save reader writes format %d and this collector reads format %d; use matching versions", out.Format, Format)
	}
	if out.SavedAt.IsZero() {
		return nil, errors.New("the save reader did not say when the save was written")
	}
	result := &Result{SavedAt: out.SavedAt.UTC()}
	for _, p := range out.Players {
		result.Players = append(result.Players, event.SavePlayerData{
			SavedAt: result.SavedAt, PlayerID: p.PlayerID, Name: p.Name, Level: p.Level,
			GuildID: p.GuildID, LastOnlineAt: p.LastOnlineAt, Progress: p.Progress,
		})
	}
	for _, g := range out.Guilds {
		members := g.Members
		if members == nil {
			members = []event.SaveGuildMember{}
		}
		result.Guilds = append(result.Guilds, event.SaveGuildData{
			SavedAt: result.SavedAt, GuildID: g.GuildID, Name: g.Name, BaseCampLevel: g.BaseCampLevel, Members: members,
		})
	}
	for _, b := range out.Bases {
		workers := b.Workers
		if workers == nil {
			workers = []event.SaveWorker{}
		}
		result.Bases = append(result.Bases, event.SaveBaseData{
			SavedAt: result.SavedAt, BaseID: b.BaseID, GuildID: b.GuildID, Name: b.Name,
			X: b.X, Y: b.Y, Z: event.Float(b.Z), Workers: workers,
		})
	}
	return result, nil
}

type Emission struct {
	Type string
	Data any
}

type Tracker struct {
	seen map[string]string
}

func NewTracker() *Tracker {
	return &Tracker{seen: map[string]string{}}
}

func fingerprint(value any) string {
	encoded, _ := json.Marshal(value)
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:])
}

func (t *Tracker) changed(key string, value any) bool {
	sum := fingerprint(value)
	if t.seen[key] == sum {
		return false
	}
	t.seen[key] = sum
	return true
}

func (t *Tracker) Changes(result *Result) []Emission {
	var out []Emission
	present := map[string]bool{"read": true}
	read := event.SaveReadData{SavedAt: result.SavedAt, PlayerIDs: []string{}, GuildIDs: []string{}, BaseIDs: []string{}}
	for _, player := range result.Players {
		read.PlayerIDs = append(read.PlayerIDs, player.PlayerID)
		present["player:"+player.PlayerID] = true
		comparable := player
		comparable.SavedAt = time.Time{}
		if t.changed("player:"+player.PlayerID, comparable) {
			out = append(out, Emission{event.TypeSavePlayer, player})
		}
	}
	for _, guild := range result.Guilds {
		read.GuildIDs = append(read.GuildIDs, guild.GuildID)
		present["guild:"+guild.GuildID] = true
		comparable := guild
		comparable.SavedAt = time.Time{}
		if t.changed("guild:"+guild.GuildID, comparable) {
			out = append(out, Emission{event.TypeSaveGuild, guild})
		}
	}
	for _, base := range result.Bases {
		read.BaseIDs = append(read.BaseIDs, base.BaseID)
		present["base:"+base.BaseID] = true
		comparable := base
		comparable.SavedAt = time.Time{}
		if t.changed("base:"+base.BaseID, comparable) {
			out = append(out, Emission{event.TypeSaveBase, base})
		}
	}
	for key := range t.seen {
		if !present[key] {
			delete(t.seen, key)
		}
	}
	sort.Strings(read.PlayerIDs)
	sort.Strings(read.GuildIDs)
	sort.Strings(read.BaseIDs)
	membership := struct{ Players, Guilds, Bases []string }{read.PlayerIDs, read.GuildIDs, read.BaseIDs}
	if t.changed("read", membership) || len(out) > 0 {
		out = append(out, Emission{event.TypeSaveRead, read})
	}
	return out
}
