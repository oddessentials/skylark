package collector

import (
	"context"
	"errors"
	"path/filepath"
	"time"

	"github.com/oddessentials/skylark/collector/internal/config"
	"github.com/oddessentials/skylark/collector/internal/remote"
	"github.com/oddessentials/skylark/collector/internal/saves"
)

const (
	savesMirrorDir   = "saves-mirror"
	savesHostKeyFile = "saves-host-key"
)

var errRestOff = errors.New("this collector reads no REST API (palworld.rest_url is off), so it cannot run server actions")

type restOff struct{}

func (restOff) Announce(context.Context, string) error      { return errRestOff }
func (restOff) Kick(context.Context, string, string) error  { return errRestOff }
func (restOff) Ban(context.Context, string, string) error   { return errRestOff }
func (restOff) Unban(context.Context, string) error         { return errRestOff }
func (restOff) Save(context.Context) error                  { return errRestOff }
func (restOff) Shutdown(context.Context, int, string) error { return errRestOff }

func (c *Collector) restOn() bool {
	return !c.cfg.Palworld.RestOff
}

func (c *Collector) actionRunner() actionRunner {
	if c.restOn() {
		return c.rest
	}
	return restOff{}
}

func remoteFetcher(cfg *config.Config, notice func(string)) (*remote.Fetcher, error) {
	return remote.New(remote.Options{
		URL:         cfg.Saves.Remote,
		Password:    cfg.Saves.Password,
		KeyFile:     cfg.Saves.Key,
		HostKey:     cfg.Saves.HostKey,
		HostKeyFile: filepath.Join(cfg.JournalDir, savesHostKeyFile),
	}, filepath.Join(cfg.JournalDir, savesMirrorDir), notice)
}

func (c *Collector) checkRemoteSaves() {
	if !c.saveReadAt.IsZero() && time.Since(c.saveReadAt) < c.cfg.Saves.Interval {
		return
	}
	c.saveRunning = true
	fetcher := c.remote
	reader := c.cfg.Saves.Reader
	last := c.saveModified
	go func() {
		outcome := saveOutcome{dir: fetcher.Where()}
		snapshot, err := fetcher.Sync(c.loopCtx)
		switch {
		case errors.Is(err, remote.ErrChanging):
			outcome.retry = true
		case err != nil:
			outcome.err = err
		case snapshot.Modified.Equal(last):
			outcome.unchanged = true
			outcome.modified = snapshot.Modified
		default:
			outcome.modified = snapshot.Modified
			outcome.result, outcome.err = saves.Read(c.loopCtx, reader, snapshot.Dir)
		}
		select {
		case c.saveResults <- outcome:
		case <-c.loopCtx.Done():
		}
	}()
}
