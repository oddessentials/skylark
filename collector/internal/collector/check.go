package collector

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"runtime"
	"time"

	"github.com/oddessentials/skylark/collector/internal/buildinfo"
	"github.com/oddessentials/skylark/collector/internal/config"
	"github.com/oddessentials/skylark/collector/internal/event"
	"github.com/oddessentials/skylark/collector/internal/ingest"
	"github.com/oddessentials/skylark/collector/internal/palrest"
	"github.com/oddessentials/skylark/collector/internal/serverlog"
	"github.com/oddessentials/skylark/collector/internal/world"
)

func Check(ctx context.Context, cfg *config.Config, out io.Writer) int {
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	failed := false
	line := func(area, status, detail string) {
		fmt.Fprintf(out, "%-9s %-5s %s\n", area, status, detail)
	}
	rest := palrest.New(cfg.Palworld.RestURL, cfg.Palworld.AdminPassword, 10*time.Second)
	info, err := rest.Info(ctx)
	if err != nil {
		failed = true
		line("rest", "FAIL", fmt.Sprintf("%s: %v", cfg.Palworld.RestURL, err))
	} else {
		line("rest", "ok", fmt.Sprintf("%s %s, world %s", info.ServerName, info.Version, info.WorldGUID))
		if raw, err := rest.Settings(ctx); err != nil {
			line("settings", "WARN", err.Error())
		} else if settings := curateSettings(raw); settings != nil {
			line("settings", "ok", fmt.Sprintf("day rate %g, night rate %g, up to %d players", settings.DayTimeSpeedRate, settings.NightTimeSpeedRate, settings.ServerPlayerMaxNum))
		}
		if players, err := rest.Players(ctx); err == nil {
			line("players", "ok", fmt.Sprintf("%d online", len(players)))
		}
		gameData, err := rest.GameData(ctx)
		switch {
		case errors.Is(err, palrest.ErrGameDataOff):
			line("gamedata", "off", "start the server with -enable-gamedata-api for pals, bases, deaths and in-game time")
		case err != nil:
			line("gamedata", "WARN", err.Error())
		default:
			data, _ := world.FromGameData(gameData, nil)
			line("gamedata", "ok", fmt.Sprintf("%d actors, %d players, %d palboxes, in-game time %s", len(gameData.ActorData), len(data.Players), len(data.PalBoxes), gameData.InGameTime))
		}
	}
	switch cfg.Logs.Source {
	case config.SourceLaunch:
		if _, err := os.Stat(cfg.Launch.Command); err != nil {
			failed = true
			line("logs", "FAIL", fmt.Sprintf("launch.command: %v", err))
		} else {
			line("logs", "ok", "launch "+cfg.Launch.Command)
		}
	case config.SourceDocker:
		running, err := serverlog.InspectContainer(ctx, cfg.Docker.Host, cfg.Docker.Container)
		switch {
		case err != nil:
			failed = true
			line("logs", "FAIL", err.Error())
		case !running:
			line("logs", "WARN", fmt.Sprintf("container %q is not running", cfg.Docker.Container))
		default:
			line("logs", "ok", fmt.Sprintf("docker container %q is running", cfg.Docker.Container))
		}
	case config.SourceFile:
		if _, err := os.Stat(cfg.File.Path); err != nil {
			line("logs", "WARN", err.Error())
		} else {
			line("logs", "ok", "file "+cfg.File.Path)
		}
	default:
		line("logs", "ok", cfg.Logs.Source)
	}
	if cfg.Site.URL == "" || cfg.Site.Secret == "" {
		failed = true
		line("site", "FAIL", "site.url and site.secret are required")
	} else {
		result, err := ingest.Probe(ctx, cfg.IngestURL(), cfg.Site.Secret, ingest.CollectorInfo{
			Name:    CollectorName,
			Version: buildinfo.Version,
			RunID:   event.NewUUID(),
			OS:      runtime.GOOS,
			Arch:    runtime.GOARCH,
		})
		if err != nil {
			failed = true
			line("site", "FAIL", fmt.Sprintf("%s: %v", cfg.IngestURL(), err))
		} else {
			line("site", "ok", fmt.Sprintf("%s accepted a signed empty batch (%d pending actions)", cfg.IngestURL(), len(result.Actions)))
		}
	}
	if failed {
		return 1
	}
	return 0
}
