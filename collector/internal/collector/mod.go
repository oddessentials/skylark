package collector

import (
	"context"
	"path/filepath"

	"github.com/oddessentials/skylark/collector/internal/event"
	"github.com/oddessentials/skylark/collector/internal/modevents"
	"github.com/oddessentials/skylark/collector/internal/palrest"
	"github.com/oddessentials/skylark/collector/internal/serverlog"
)

const modCursorFile = "mod-events.cursor"

func (c *Collector) modEnabled() bool {
	return c.cfg.Mod.Events != ""
}

func (c *Collector) runMod(ctx context.Context, done <-chan struct{}) {
	source := &serverlog.FileSource{
		Path:       c.cfg.Mod.Events,
		CursorPath: filepath.Join(c.cfg.JournalDir, modCursorFile),
	}
	source.Run(ctx, &sink{lines: c.modLines, states: c.modStates, done: done})
}

func (c *Collector) modStateName() string {
	switch {
	case !c.modEnabled():
		return "off"
	case c.modState == serverlog.StateConnected:
		return "ok"
	}
	return "waiting"
}

func (c *Collector) onModState(state sourceState) {
	previous := c.modState
	c.modState = state.state
	if state.state == serverlog.StateConnected && previous != serverlog.StateConnected {
		c.log.Info("reading the Skylark mod's events", "file", c.cfg.Mod.Events)
	}
}

func (c *Collector) modPlayer(playerID string) (palrest.Player, bool) {
	if playerID == "" {
		return palrest.Player{}, false
	}
	for _, player := range c.lastPlayers {
		if palrest.PlayerUID(player.PlayerID) == playerID {
			return player, true
		}
	}
	return palrest.Player{}, false
}

func (c *Collector) modKiller(record modevents.Record, data *event.PlayerDiedData) {
	killer, kind := record.Killer()
	if kind == "" {
		return
	}
	data.KillerKind = event.String(kind)
	if kind == modevents.KillerCharacter {
		data.Killer = event.String(killer)
		data.KillerLevel = record.KillerLevel
		return
	}
	if record.KillerName != "" {
		data.Killer = event.String(record.KillerName)
	} else if other, ok := c.modPlayer(record.KillerID); ok && other.Name != "" {
		data.Killer = event.String(other.Name)
	}
}

func (c *Collector) modEmission(record modevents.Record) (emission, bool) {
	player, ok := c.modPlayer(record.PlayerID)
	if !ok || player.UserID == "" {
		return emission{}, false
	}
	name := player.Name
	if name == "" {
		name = record.Name
	}
	playerID := event.String(record.PlayerID)
	switch record.Type {
	case modevents.TypeKnockout:
		data := event.PlayerDiedData{
			UserID:   player.UserID,
			PlayerID: playerID,
			Name:     name,
			X:        player.LocationX,
			Y:        player.LocationY,
			Source:   event.SourceMod,
			Cause:    optional(record.Cause),
		}
		c.modKiller(record, &data)
		return emission{event.TypePlayerDied, record.At, data}, true
	case modevents.TypeCapture:
		return emission{event.TypePalCaptured, record.At, event.PalCapturedData{UserID: player.UserID, PlayerID: playerID, Name: name, Species: record.Species, Level: record.Level}}, true
	case modevents.TypeHatch:
		return emission{event.TypePalHatched, record.At, event.PalHatchedData{UserID: player.UserID, PlayerID: playerID, Name: name, Species: record.Species, Level: record.Level}}, true
	case modevents.TypeBoss:
		return emission{event.TypeBossDefeated, record.At, event.BossDefeatedData{
			UserID:     player.UserID,
			PlayerID:   playerID,
			Name:       name,
			Kind:       record.Kind,
			Boss:       record.Boss,
			Difficulty: optional(record.Difficulty),
			Species:    optional(record.Species),
		}}, true
	case modevents.TypeTechnology:
		return emission{event.TypeTechnologyUnlocked, record.At, event.TechnologyUnlockedData{UserID: player.UserID, PlayerID: playerID, Name: name, Technology: record.Technology}}, true
	case modevents.TypeBuild:
		return emission{event.TypeStructureBuilt, record.At, event.StructureBuiltData{UserID: player.UserID, PlayerID: playerID, Name: name, Structure: record.Structure}}, true
	}
	return emission{}, false
}

func (c *Collector) onModLine(line serverlog.Line) {
	record, err := modevents.Parse(line.Text, line.ReceivedAt)
	if err != nil {
		if !c.modWarned {
			c.modWarned = true
			c.log.Warn("the Skylark mod wrote a line the collector does not understand", "error", err)
		}
		return
	}
	item, ok := c.modEmission(record)
	if !ok {
		c.log.Debug("a mod event for a player who is not online", "type", record.Type)
		return
	}
	c.emit(item.Type, item.At, item.Data)
}

func optional(value string) *string {
	if value == "" {
		return nil
	}
	return event.String(value)
}
