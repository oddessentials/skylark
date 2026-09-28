package collector

import (
	"time"

	"github.com/oddessentials/skylark/collector/internal/saves"
)

const saveCheckEvery = 30 * time.Second

const (
	saveOff     = "off"
	saveWaiting = "waiting"
	saveOK      = "ok"
	saveError   = "error"
)

type saveOutcome struct {
	result   *saves.Result
	err      error
	modified time.Time
	dir      string
}

func (c *Collector) savesEnabled() bool {
	return c.cfg.Saves.Reader != ""
}

func (c *Collector) checkSaves() {
	if !c.savesEnabled() || c.saveRunning || !c.serverUp {
		return
	}
	worldGUID := ""
	if server := c.server.Load(); server != nil {
		worldGUID = server.WorldGUID
	}
	dir, ok := saves.Locate(c.cfg.SaveRoots, worldGUID)
	if !ok {
		if !c.saveDirWarned {
			c.saveDirWarned = true
			c.log.Warn("the world save folder was not found; set saves.dir to the folder that holds Level.sav", "looked_in", c.cfg.SaveRoots, "world", worldGUID)
		}
		return
	}
	c.saveDirWarned = false
	modified, err := saves.Modified(dir)
	if err != nil {
		return
	}
	if dir == c.saveDir && modified.Equal(c.saveModified) {
		return
	}
	if !c.saveReadAt.IsZero() && time.Since(c.saveReadAt) < c.cfg.Saves.Interval {
		return
	}
	c.saveRunning = true
	reader := c.cfg.Saves.Reader
	go func() {
		result, err := saves.Read(c.loopCtx, reader, dir)
		select {
		case c.saveResults <- saveOutcome{result: result, err: err, modified: modified, dir: dir}:
		case <-c.loopCtx.Done():
		}
	}()
}

func (c *Collector) onSaveResult(outcome saveOutcome) {
	c.saveRunning = false
	c.saveReadAt = time.Now()
	if outcome.err != nil {
		c.saveState = saveError
		if message := outcome.err.Error(); message != c.saveProblem {
			c.saveProblem = message
			c.log.Warn("reading the world save failed", "dir", outcome.dir, "error", outcome.err)
		}
		return
	}
	if c.saveState != saveOK {
		c.log.Info("reading the world save", "dir", outcome.dir, "players", len(outcome.result.Players), "guilds", len(outcome.result.Guilds), "bases", len(outcome.result.Bases))
	}
	c.saveState = saveOK
	c.saveProblem = ""
	c.saveDir = outcome.dir
	c.saveModified = outcome.modified
	for _, item := range c.saveTracker.Changes(outcome.result) {
		c.emit(item.Type, outcome.result.SavedAt, item.Data)
	}
}
