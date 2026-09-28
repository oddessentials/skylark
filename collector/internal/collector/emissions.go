package collector

import (
	"runtime"
	"time"

	"github.com/oddessentials/skylark/collector/internal/buildinfo"
	"github.com/oddessentials/skylark/collector/internal/event"
	"github.com/oddessentials/skylark/collector/internal/palrest"
	"github.com/oddessentials/skylark/collector/internal/world"
)

func changeEmission(change world.Change, at time.Time) (emission, bool) {
	playerID := event.String(change.PlayerID)
	switch change.Kind {
	case world.Joined:
		return emission{event.TypePlayerJoined, at, event.PlayerJoinedData{UserID: change.UserID, PlayerID: playerID, Name: change.Name, Source: event.SourceRest}}, true
	case world.Left:
		return emission{event.TypePlayerLeft, at, event.PlayerLeftData{UserID: change.UserID, PlayerID: playerID, Name: change.Name, Source: event.SourceRest}}, true
	case world.LevelUp:
		return emission{event.TypePlayerLevelUp, at, event.PlayerLevelUpData{UserID: change.UserID, PlayerID: playerID, Name: change.Name, From: change.From, To: change.To}}, true
	case world.Died:
		return emission{event.TypePlayerDied, at, event.PlayerDiedData{
			UserID:   change.UserID,
			PlayerID: playerID,
			Name:     change.Name,
			X:        change.X,
			Y:        change.Y,
			Z:        change.Z,
			Source:   event.SourceSnapshot,
		}}, true
	}
	return emission{}, false
}

func actionEmission(result actionResult, at time.Time) emission {
	if result.Err != nil {
		return emission{event.TypeActionFailed, at, event.ActionFailedData{
			ActionID: result.Action.ID,
			Kind:     result.Action.Kind,
			Error:    result.Err.Error(),
		}}
	}
	return emission{event.TypeActionCompleted, at, event.ActionCompletedData{
		ActionID: result.Action.ID,
		Kind:     result.Action.Kind,
	}}
}

func metricsData(metrics palrest.Metrics) event.ServerMetricsData {
	return event.ServerMetricsData{
		FPS:         metrics.ServerFPS,
		FPSAvg:      metrics.ServerFPSAverage,
		FrameTimeMS: metrics.ServerFrameTime,
		Players:     max(0, metrics.CurrentPlayerNum),
		MaxPlayers:  max(0, metrics.MaxPlayerNum),
		Days:        max(0, metrics.Days),
		BaseCamps:   max(0, metrics.BaseCampNum),
		UptimeS:     max(0, metrics.Uptime),
	}
}

func startedData(layers event.CollectorLayers, server *event.ServerInfo, settings *event.ServerSettings) event.CollectorStartedData {
	return event.CollectorStartedData{
		CollectorVersion: buildinfo.Version,
		OS:               runtime.GOOS,
		Arch:             runtime.GOARCH,
		Layers:           layers,
		Server:           server,
		Settings:         settings,
	}
}
