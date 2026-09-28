package collector

import (
	"math"
	"strings"

	"github.com/oddessentials/skylark/collector/internal/event"
	"github.com/oddessentials/skylark/collector/internal/palrest"
)

func serverInfo(info palrest.Info) event.ServerInfo {
	return event.ServerInfo{
		Version:     info.Version,
		Name:        info.ServerName,
		Description: info.Description,
		WorldGUID:   info.WorldGUID,
	}
}

func curateSettings(raw map[string]any) *event.ServerSettings {
	folded := make(map[string]any, len(raw))
	for key, value := range raw {
		folded[strings.ToLower(key)] = value
	}
	number := func(key string) (float64, bool) {
		value, ok := folded[strings.ToLower(key)].(float64)
		return value, ok && !math.IsNaN(value) && !math.IsInf(value, 0)
	}
	integer := func(key string) (int, bool) {
		value, ok := number(key)
		if !ok || value != math.Trunc(value) {
			return 0, false
		}
		return int(value), true
	}
	day, okDay := number("DayTimeSpeedRate")
	night, okNight := number("NightTimeSpeedRate")
	maxPlayers, okMax := integer("ServerPlayerMaxNum")
	if !okDay || !okNight || !okMax {
		return nil
	}
	settings := &event.ServerSettings{
		DayTimeSpeedRate:   day,
		NightTimeSpeedRate: night,
		ServerPlayerMaxNum: maxPlayers,
	}
	if value, ok := folded["bispvp"].(bool); ok {
		settings.IsPvP = event.Bool(value)
	}
	if value, ok := folded["bhardcore"].(bool); ok {
		settings.IsHardcore = event.Bool(value)
	}
	if value, ok := number("ExpRate"); ok {
		settings.ExpRate = event.Float(value)
	}
	if value, ok := number("PalCaptureRate"); ok {
		settings.PalCaptureRate = event.Float(value)
	}
	if value, ok := folded["deathpenalty"].(string); ok && value != "" {
		settings.DeathPenalty = event.String(value)
	}
	if value, ok := integer("GuildPlayerMaxNum"); ok {
		settings.GuildPlayerMaxNum = event.Int(value)
	}
	if value, ok := integer("BaseCampMaxNumInGuild"); ok {
		settings.BaseCampMaxNumInGuild = event.Int(value)
	}
	return settings
}
