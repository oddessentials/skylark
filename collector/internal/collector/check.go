package collector

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"runtime"
	"strings"
	"time"

	"github.com/oddessentials/skylark/collector/internal/buildinfo"
	"github.com/oddessentials/skylark/collector/internal/config"
	"github.com/oddessentials/skylark/collector/internal/event"
	"github.com/oddessentials/skylark/collector/internal/ingest"
	"github.com/oddessentials/skylark/collector/internal/palrest"
	"github.com/oddessentials/skylark/collector/internal/remote"
	"github.com/oddessentials/skylark/collector/internal/saves"
	"github.com/oddessentials/skylark/collector/internal/serverlog"
	"github.com/oddessentials/skylark/collector/internal/world"
)

func fileSize(bytes int64) string {
	if bytes < 1<<20 {
		return fmt.Sprintf("%d KB", (bytes+1023)/1024)
	}
	return fmt.Sprintf("%.1f MB", float64(bytes)/(1<<20))
}

func restInfo(ctx context.Context, cfg *config.Config) (*palrest.Client, palrest.Info, error) {
	rest := palrest.New(cfg.Palworld.RestURL, cfg.Palworld.AdminPassword, 10*time.Second)
	info, err := rest.Info(ctx)
	return rest, info, err
}

func Check(ctx context.Context, cfg *config.Config, out io.Writer) int {
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	failed := false
	line := func(area, status, detail string) {
		fmt.Fprintf(out, "%-9s %-5s %s\n", area, status, detail)
	}
	worldGUID := ""
	if cfg.Palworld.RestOff {
		line("rest", "off", "palworld.rest_url is off: no live players, positions, chat or server actions")
	} else if rest, info, err := restInfo(ctx, cfg); err != nil {
		failed = true
		line("rest", "FAIL", fmt.Sprintf("%s: %v", cfg.Palworld.RestURL, err))
	} else {
		worldGUID = info.WorldGUID
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
	switch {
	case cfg.Saves.Reader == "":
		line("saves", "off", "no save reader beside the collector")
	case cfg.Saves.Remote != "":
		fetcher, err := remoteFetcher(cfg, func(text string) { line("saves", "note", text) })
		var snapshot remote.Snapshot
		if err == nil {
			snapshot, err = fetcher.Probe(ctx)
		}
		if err != nil {
			failed = true
			line("saves", "FAIL", fmt.Sprintf("%s: %v", remote.Redact(cfg.Saves.Remote), err))
		} else {
			line("saves", "ok", fmt.Sprintf("%s: %s, Level.sav %s written %s, %d player files", fetcher.Where(), snapshot.World, fileSize(snapshot.Size), snapshot.Modified.UTC().Format(time.RFC3339), snapshot.Players))
		}
	case len(cfg.SaveRoots) > 0:
		if dir, ok := saves.Locate(cfg.SaveRoots, worldGUID); ok {
			line("saves", "ok", dir)
		} else {
			line("saves", "WARN", "no Level.sav in "+strings.Join(cfg.SaveRoots, ", "))
		}
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
