package modevents

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const FileName = "skylark-events.jsonl"

const (
	TypeCapture    = "capture"
	TypeHatch      = "hatch"
	TypeBoss       = "boss"
	TypeTechnology = "technology"
	TypeBuild      = "build"
	TypeKnockout   = "knockout"
)

type Record struct {
	Version       int       `json:"v"`
	Type          string    `json:"type"`
	At            time.Time `json:"-"`
	Timestamp     string    `json:"ts"`
	PlayerID      string    `json:"player_id"`
	Name          string    `json:"name"`
	Species       string    `json:"species"`
	Level         *int      `json:"level"`
	Technology    string    `json:"technology"`
	Structure     string    `json:"structure"`
	Boss          string    `json:"boss"`
	Kind          string    `json:"kind"`
	Difficulty    string    `json:"difficulty"`
	Cause         string    `json:"cause"`
	KillerID      string    `json:"killer_player_id"`
	KillerName    string    `json:"killer_name"`
	KillerSpecies string    `json:"killer_species"`
	KillerLevel   *int      `json:"killer_level"`
}

var ErrUnknownType = errors.New("unknown mod event type")

func Parse(line string, received time.Time) (Record, error) {
	var record Record
	if err := json.Unmarshal([]byte(line), &record); err != nil {
		return Record{}, fmt.Errorf("reading a mod event: %w", err)
	}
	if record.Version != 1 {
		return Record{}, fmt.Errorf("mod event version %d is not supported", record.Version)
	}
	switch record.Type {
	case TypeCapture, TypeHatch:
		if record.Species == "" {
			return Record{}, fmt.Errorf("a %s event needs a species", record.Type)
		}
	case TypeBoss:
		if record.Boss == "" {
			return Record{}, errors.New("a boss event needs a boss")
		}
		if record.Kind != "tower" && record.Kind != "raid" {
			return Record{}, fmt.Errorf("boss kind %q is neither tower nor raid", record.Kind)
		}
		if record.Difficulty != "" && record.Difficulty != "normal" && record.Difficulty != "hard" {
			return Record{}, fmt.Errorf("boss difficulty %q is neither normal nor hard", record.Difficulty)
		}
	case TypeTechnology:
		if record.Technology == "" {
			return Record{}, errors.New("a technology event needs a technology")
		}
	case TypeBuild:
		if record.Structure == "" {
			return Record{}, errors.New("a build event needs a structure")
		}
	case TypeKnockout:
	default:
		return Record{}, fmt.Errorf("%w %q", ErrUnknownType, record.Type)
	}
	record.PlayerID = strings.ToUpper(strings.TrimSpace(record.PlayerID))
	record.KillerID = strings.ToUpper(strings.TrimSpace(record.KillerID))
	record.At = received
	if at, err := time.Parse(time.RFC3339, record.Timestamp); err == nil {
		record.At = at
	}
	return record, nil
}

const (
	KillerPlayer    = "player"
	KillerCharacter = "character"
)

func (r Record) Killer() (string, string) {
	switch {
	case r.KillerName != "":
		return r.KillerName, KillerPlayer
	case r.KillerID != "":
		return r.KillerID, KillerPlayer
	case r.KillerSpecies != "":
		return r.KillerSpecies, KillerCharacter
	}
	return "", ""
}

func Candidates(serverRoot string) []string {
	if serverRoot == "" {
		return nil
	}
	return []string{
		filepath.Join(serverRoot, "Mods", "NativeMods", "UE4SS", "Mods", FileName),
		filepath.Join(serverRoot, "Pal", "Binaries", "Win64", "ue4ss", "Mods", FileName),
	}
}

func Locate(serverRoot string) string {
	for _, candidate := range Candidates(serverRoot) {
		if info, err := os.Stat(filepath.Dir(candidate)); err == nil && info.IsDir() {
			return candidate
		}
	}
	return ""
}

func ServerRoot(executable string) string {
	if executable == "" {
		return ""
	}
	dir := filepath.Dir(executable)
	for range 5 {
		if info, err := os.Stat(filepath.Join(dir, "Pal", "Binaries")); err == nil && info.IsDir() {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return ""
}
