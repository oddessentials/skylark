package collector

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/oddessentials/skylark/collector/internal/buildinfo"
	"github.com/oddessentials/skylark/collector/internal/config"
	"github.com/oddessentials/skylark/collector/internal/event"
	"github.com/oddessentials/skylark/collector/internal/ingest"
	"github.com/oddessentials/skylark/collector/internal/palrest"
	"github.com/oddessentials/skylark/collector/internal/serverlog"
	"github.com/oddessentials/skylark/collector/internal/world"
)

const (
	CollectorName    = "skylark-collector"
	maxSnapshotBytes = 400 * 1024
	gameDataReprobe  = 5 * time.Minute
	logIdleAfter     = 2 * time.Minute
	maxPreStart      = 20000
)

const (
	gameDataUnknown = "unknown"
	gameDataOK      = "ok"
	gameDataOff     = "off"
)

type Options struct {
	Config       *config.Config
	Logger       *slog.Logger
	Stdout       io.Writer
	Stdin        io.Reader
	DryRun       io.Writer
	Source       serverlog.Source
	IngestHTTP   *http.Client
	RestTimeout  time.Duration
	StartupWait  time.Duration
	StopFlush    time.Duration
	OfflineAfter time.Duration
}

type restResult struct {
	kind     string
	players  []palrest.Player
	gameData palrest.GameData
	metrics  palrest.Metrics
	info     palrest.Info
	settings map[string]any
	err      error
	at       time.Time
}

type sourceState struct {
	state serverlog.State
	err   error
}

type sink struct {
	lines  chan serverlog.Line
	states chan sourceState
	done   <-chan struct{}
}

func (s *sink) Line(line serverlog.Line) {
	select {
	case s.lines <- line:
	case <-s.done:
	}
}

func (s *sink) State(state serverlog.State, err error) {
	select {
	case s.states <- sourceState{state, err}:
	case <-s.done:
	}
}

type Collector struct {
	options   Options
	cfg       *config.Config
	log       *slog.Logger
	rest      *palrest.Client
	factory   *event.Factory
	journal   *ingest.Journal
	pipe      *ingest.Pipeline
	tracker   *world.Tracker
	mapper    *logMapper
	actionLog *ActionLog
	startedAt time.Time

	server         atomic.Pointer[event.ServerInfo]
	expectShutdown atomic.Bool

	source  serverlog.Source
	launch  *serverlog.LaunchSource
	process serverlog.Process

	loopCtx       context.Context
	results       chan restResult
	lines         chan serverlog.Line
	states        chan sourceState
	actionResults chan actionResult
	inflight      map[string]bool

	startedEmitted   bool
	startupDeadline  time.Time
	startupInfoTried bool
	preStart         []emission

	serverUp          bool
	settings          *event.ServerSettings
	restLastOK        time.Time
	restFailures      int
	restEverOK        bool
	unauthorizedShown bool

	gameDataState     string
	gameDataProbed    bool
	gameDataNextProbe time.Time

	lastPlayers         []palrest.Player
	lastPlayersAt       time.Time
	lastSnapshotAt      time.Time
	lastSnapshotPlayers int
	lastPalBoxSig       string
	lastUptime          float64

	logState    serverlog.State
	logFormat   serverlog.Kind
	lastLogLine time.Time
	textWarned  bool
	clockWarned bool

	stopping       bool
	stopDeadline   time.Time
	killed         bool
	exitErr        error
	forceRequested bool
}

func New(options Options) (*Collector, error) {
	cfg := options.Config
	if options.Logger == nil {
		options.Logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	if options.RestTimeout <= 0 {
		options.RestTimeout = 10 * time.Second
	}
	if options.StopFlush <= 0 {
		options.StopFlush = 10 * time.Second
	}
	if options.OfflineAfter <= 0 {
		options.OfflineAfter = 20 * time.Second
	}
	if options.StartupWait <= 0 {
		options.StartupWait = 15 * time.Second
		if cfg.Logs.Source == config.SourceLaunch {
			options.StartupWait = 120 * time.Second
		}
	}
	journal, replay, err := ingest.OpenJournal(cfg.JournalDir)
	if err != nil {
		return nil, fmt.Errorf("opening the journal in %s: %w", cfg.JournalDir, err)
	}
	actionLog, err := OpenActionLog(cfg.JournalDir)
	if err != nil {
		journal.Close()
		return nil, fmt.Errorf("opening the action log: %w", err)
	}
	c := &Collector{
		options:       options,
		cfg:           cfg,
		log:           options.Logger,
		rest:          palrest.New(cfg.Palworld.RestURL, cfg.Palworld.AdminPassword, options.RestTimeout),
		factory:       event.NewFactory(event.NewUUID()),
		journal:       journal,
		tracker:       world.NewTracker(),
		actionLog:     actionLog,
		results:       make(chan restResult, 32),
		lines:         make(chan serverlog.Line, 4096),
		states:        make(chan sourceState, 64),
		actionResults: make(chan actionResult, 64),
		inflight:      map[string]bool{},
		gameDataState: gameDataUnknown,
		logFormat:     serverlog.KindOther,
		logState:      serverlog.StateConnecting,
	}
	c.mapper = &logMapper{tracker: c.tracker, sendIPs: cfg.SendIPs}
	c.pipe = ingest.NewPipeline(ingest.Options{
		URL:           cfg.IngestURL(),
		Secret:        cfg.Site.Secret,
		FlushInterval: cfg.Intervals.Flush,
		ActionPoll:    cfg.Intervals.Actions,
		UserAgent:     CollectorName + "/" + buildinfo.Version,
		DryRun:        options.DryRun,
		Client:        options.IngestHTTP,
	}, journal, replay, c.envelope, options.Logger)
	return c, nil
}

func (c *Collector) RunID() string {
	return c.factory.RunID()
}

func (c *Collector) envelope() (ingest.CollectorInfo, any) {
	info := ingest.CollectorInfo{
		Name:    CollectorName,
		Version: buildinfo.Version,
		RunID:   c.factory.RunID(),
		OS:      runtime.GOOS,
		Arch:    runtime.GOARCH,
	}
	if server := c.server.Load(); server != nil {
		return info, *server
	}
	return info, nil
}

func (c *Collector) setupSource() error {
	switch {
	case c.options.Source != nil:
		c.source = c.options.Source
	case c.cfg.Logs.Source == config.SourceLaunch:
		args, added := serverlog.WithLaunchFlags(c.cfg.Launch.Args, *c.cfg.Launch.EnableGameData)
		if len(added) > 0 {
			c.log.Info("added launch flags the collector needs", "flags", strings.Join(added, " "))
		}
		spec, resolved := serverlog.ResolveLaunch(serverlog.LaunchSpec{Command: c.cfg.Launch.Command, Args: args, Dir: c.cfg.Launch.WorkDir})
		if resolved {
			c.log.Info("starting the server binary directly, because PalServer.exe hands the server a console the collector cannot read", "command", spec.Command)
		}
		process, err := serverlog.StartProcess(spec)
		if err != nil {
			return fmt.Errorf("starting the server: %w", err)
		}
		c.process = process
		c.launch = serverlog.NewLaunchSource(process, c.options.Stdout)
		c.launch.MirrorFilter = mirrorable
		c.source = c.launch
		c.log.Info("started the server", "pid", process.Pid(), "command", spec.Command)
	case c.cfg.Logs.Source == config.SourceDocker:
		c.source = &serverlog.DockerSource{
			Host:       c.cfg.Docker.Host,
			Container:  c.cfg.Docker.Container,
			CursorPath: filepath.Join(c.journal.Dir(), "docker.cursor"),
		}
	case c.cfg.Logs.Source == config.SourceFile:
		c.source = &serverlog.FileSource{Path: c.cfg.File.Path, CursorPath: filepath.Join(c.journal.Dir(), "file.cursor")}
	case c.cfg.Logs.Source == config.SourceStdin:
		c.source = &serverlog.StdinSource{Reader: c.options.Stdin, Mirror: c.options.Stdout, MirrorFilter: mirrorable}
	}
	return nil
}

func mirrorable(text string) bool {
	kind, records := serverlog.Classify(text)
	if kind != serverlog.KindJSON {
		return true
	}
	for _, record := range records {
		if !(record.Event == "command" && strings.EqualFold(record.PlayerName, "REST")) {
			return true
		}
	}
	return false
}

func (c *Collector) Run(ctx context.Context, force <-chan struct{}) error {
	c.startedAt = time.Now()
	loopCtx, loopCancel := context.WithCancel(context.Background())
	defer loopCancel()
	c.loopCtx = loopCtx
	if err := c.setupSource(); err != nil {
		c.journal.Close()
		return err
	}
	pipeCtx, pipeCancel := context.WithCancel(context.Background())
	var workers sync.WaitGroup
	workers.Add(1)
	go func() {
		defer workers.Done()
		c.pipe.Run(pipeCtx)
	}()
	actionCtx, actionCancel := context.WithCancel(context.Background())
	workers.Add(1)
	go func() {
		defer workers.Done()
		runActions(actionCtx, c.rest, c.actionLog, c.pipe.Actions(), c.actionResults, func() { c.expectShutdown.Store(true) })
	}()
	sourceCtx, sourceCancel := context.WithCancel(context.Background())
	sourceDone := make(chan struct{})
	if c.source != nil {
		go func() {
			defer close(sourceDone)
			c.source.Run(sourceCtx, &sink{lines: c.lines, states: c.states, done: loopCtx.Done()})
		}()
	} else {
		close(sourceDone)
		c.logState = serverlog.StateDown
	}
	site := c.cfg.IngestURL()
	if c.options.DryRun != nil {
		site = "dry run, batches go to stdout"
	}
	c.log.Info("collector running",
		"version", buildinfo.Version,
		"run_id", c.factory.RunID(),
		"rest", c.cfg.Palworld.RestURL,
		"logs", c.cfg.Logs.Source,
		"site", site,
		"journal", c.cfg.JournalDir)
	c.startupDeadline = time.Now().Add(c.options.StartupWait)
	c.fetchInfo()
	c.fetchGameData()
	c.loop(ctx, force)
	sourceCancel()
	actionCancel()
	flushCtx, flushCancel := context.WithTimeout(context.Background(), c.options.StopFlush)
	if !c.pipe.Flush(flushCtx) {
		c.log.Warn("some events were not delivered before exit; they stay in the journal and are sent on the next start", "pending", c.pipe.Stats().Depth)
	}
	flushCancel()
	pipeCancel()
	loopCancel()
	select {
	case <-sourceDone:
	case <-time.After(3 * time.Second):
	}
	workers.Wait()
	c.journal.Close()
	if c.launch != nil && c.exitErr != nil {
		return c.exitErr
	}
	return nil
}

func (c *Collector) loop(ctx context.Context, force <-chan struct{}) {
	intervals := c.cfg.Intervals
	players := time.NewTicker(intervals.Players)
	snapshot := time.NewTicker(intervals.Snapshot)
	metrics := time.NewTicker(intervals.Metrics)
	heartbeat := time.NewTicker(intervals.Heartbeat)
	housekeeping := time.NewTicker(500 * time.Millisecond)
	defer players.Stop()
	defer snapshot.Stop()
	defer metrics.Stop()
	defer heartbeat.Stop()
	defer housekeeping.Stop()
	signals := ctx.Done()
	for {
		select {
		case <-signals:
			signals = nil
			if !c.beginStop() {
				return
			}
		case <-force:
			c.forceStop()
		case <-players.C:
			c.fetchPlayers()
		case <-snapshot.C:
			c.onSnapshotTick()
		case <-metrics.C:
			c.fetchMetrics()
		case <-heartbeat.C:
			c.emitHeartbeat()
		case <-housekeeping.C:
			if c.housekeeping() {
				return
			}
		case result := <-c.results:
			c.inflight[result.kind] = false
			c.onResult(result)
		case line := <-c.lines:
			c.onLine(line)
		case state := <-c.states:
			if c.onSourceState(state) {
				c.drainLines()
				c.finishProcess()
				return
			}
		case result := <-c.actionResults:
			c.onActionResult(result)
		}
	}
}

func (c *Collector) drainLines() {
	for {
		select {
		case line := <-c.lines:
			c.onLine(line)
		default:
			return
		}
	}
}

func (c *Collector) beginStop() bool {
	if c.launch == nil {
		c.drainLines()
		c.ensureStarted()
		if c.serverUp {
			c.markOffline(event.OfflineCollectorStopping)
		}
		c.log.Info("stopping")
		return false
	}
	c.stopping = true
	c.expectShutdown.Store(true)
	wait := c.cfg.Launch.ShutdownWait
	c.stopDeadline = time.Now().Add(wait + 90*time.Second)
	c.log.Info("stopping: saving the world, then asking the server to shut down", "wait", wait.String())
	seconds := int(wait.Round(time.Second) / time.Second)
	if seconds < 1 {
		seconds = 1
	}
	go func() {
		callCtx, cancel := context.WithTimeout(c.loopCtx, 15*time.Second)
		defer cancel()
		if err := c.rest.Save(callCtx); err != nil {
			c.log.Warn("saving the world before the shutdown failed", "error", err)
		} else {
			c.log.Info("saved the world")
		}
		if err := c.rest.Shutdown(callCtx, seconds, c.cfg.Launch.ShutdownMessage); err != nil {
			c.log.Warn("the REST shutdown failed; interrupting the server instead", "error", err)
			if c.process != nil {
				c.process.Interrupt()
			}
		}
	}()
	return true
}

func (c *Collector) forceStop() {
	if c.process == nil || c.forceRequested {
		return
	}
	c.forceRequested = true
	c.log.Warn("forcing the server to stop without saving")
	c.killed = true
	c.process.Kill()
}

func (c *Collector) housekeeping() bool {
	now := time.Now()
	if !c.startedEmitted {
		ready := c.serverUp && c.gameDataProbed
		launch := c.cfg.Logs.Source == config.SourceLaunch
		if !launch && c.startupInfoTried && !c.serverUp && c.gameDataProbed {
			ready = true
		}
		if ready || now.After(c.startupDeadline) {
			c.ensureStarted()
		} else if !c.serverUp {
			c.fetchInfo()
		}
	}
	if c.serverUp && c.restFailures >= 3 && now.Sub(c.restLastOK) >= c.options.OfflineAfter {
		reason := event.OfflineUnreachable
		if c.expectShutdown.Load() {
			reason = event.OfflineShutdown
		}
		c.markOffline(reason)
	}
	if c.stopping && !c.stopDeadline.IsZero() && now.After(c.stopDeadline) && !c.killed {
		c.log.Warn("the server did not stop in time; terminating it")
		c.killed = true
		if c.process != nil {
			c.process.Kill()
		}
		c.stopDeadline = now.Add(15 * time.Second)
	} else if c.stopping && c.killed && now.After(c.stopDeadline) {
		c.log.Error("the server process did not exit after being terminated")
		c.ensureStarted()
		if c.serverUp {
			c.markOffline(event.OfflineShutdown)
		}
		return true
	}
	return false
}

func (c *Collector) ensureStarted() {
	if c.startedEmitted {
		return
	}
	c.startedEmitted = true
	var source *string
	if c.cfg.Logs.Source != config.SourceNone {
		source = event.String(c.cfg.Logs.Source)
	}
	c.enqueue(event.TypeCollectorStarted, c.startedAt, startedData(event.CollectorLayers{
		Rest:       c.restEverOK,
		GameData:   c.gameDataState == gameDataOK,
		Logs:       c.cfg.Logs.Source != config.SourceNone,
		LogsSource: source,
	}, c.server.Load(), c.settings))
	pending := c.preStart
	c.preStart = nil
	for _, item := range pending {
		c.enqueue(item.Type, item.At, item.Data)
	}
	for _, entry := range c.actionLog.Interrupted() {
		c.enqueue(event.TypeActionFailed, time.Now(), event.ActionFailedData{
			ActionID: entry.ID,
			Kind:     entry.Kind,
			Error:    "the collector restarted before the outcome was known",
		})
		c.actionLog.Record(entry.ID, entry.Kind, actionFinished)
	}
	c.pipe.Wake()
}

func (c *Collector) emit(eventType string, at time.Time, data any) {
	if !c.startedEmitted {
		if len(c.preStart) >= maxPreStart {
			c.preStart = c.preStart[1:]
		}
		c.preStart = append(c.preStart, emission{eventType, at, data})
		return
	}
	c.enqueue(eventType, at, data)
}

func (c *Collector) enqueue(eventType string, at time.Time, data any) {
	created, err := c.factory.New(eventType, at, data)
	if err != nil {
		c.log.Error("building an event failed", "type", eventType, "error", err)
		return
	}
	raw, err := created.Marshal()
	if err != nil {
		c.log.Error("encoding an event failed", "type", eventType, "error", err)
		return
	}
	if err := c.pipe.Enqueue(raw); err != nil {
		c.log.Error("queueing an event failed", "type", eventType, "error", err)
	}
}

func (c *Collector) fetch(kind string, call func(ctx context.Context) restResult) {
	if c.inflight[kind] {
		return
	}
	c.inflight[kind] = true
	go func() {
		ctx, cancel := context.WithTimeout(c.loopCtx, c.options.RestTimeout+time.Second)
		defer cancel()
		result := call(ctx)
		result.kind = kind
		result.at = time.Now()
		select {
		case c.results <- result:
		case <-c.loopCtx.Done():
		}
	}()
}

func (c *Collector) fetchInfo() {
	c.fetch("info", func(ctx context.Context) restResult {
		info, err := c.rest.Info(ctx)
		if err != nil {
			return restResult{err: err}
		}
		settings, settingsErr := c.rest.Settings(ctx)
		if settingsErr != nil {
			c.log.Warn("reading the server settings failed", "error", settingsErr)
		}
		return restResult{info: info, settings: settings}
	})
}

func (c *Collector) fetchPlayers() {
	c.fetch("players", func(ctx context.Context) restResult {
		players, err := c.rest.Players(ctx)
		return restResult{players: players, err: err}
	})
}

func (c *Collector) fetchMetrics() {
	c.fetch("metrics", func(ctx context.Context) restResult {
		metrics, err := c.rest.Metrics(ctx)
		return restResult{metrics: metrics, err: err}
	})
}

func (c *Collector) fetchGameData() {
	c.fetch("gamedata", func(ctx context.Context) restResult {
		data, err := c.rest.GameData(ctx)
		return restResult{gameData: data, err: err}
	})
}

func (c *Collector) onSnapshotTick() {
	switch c.gameDataState {
	case gameDataOff:
		if time.Now().After(c.gameDataNextProbe) {
			c.fetchGameData()
			return
		}
		c.restSnapshot()
	default:
		c.fetchGameData()
	}
}

func (c *Collector) restSnapshot() {
	if !c.serverUp || c.lastPlayersAt.IsZero() || time.Since(c.lastPlayersAt) > 3*c.cfg.Intervals.Players {
		return
	}
	data, _ := world.FromPlayers(c.lastPlayers)
	c.emitSnapshot(data, c.lastPlayersAt)
}

func (c *Collector) emitSnapshot(data event.WorldSnapshotData, at time.Time) {
	signature := world.PalBoxSignature(data)
	idle := len(data.Players) == 0 && c.lastSnapshotPlayers == 0 && signature == c.lastPalBoxSig
	if idle && !c.lastSnapshotAt.IsZero() && at.Sub(c.lastSnapshotAt) < c.cfg.Intervals.SnapshotIdle {
		return
	}
	if err := world.Fit(&data, maxSnapshotBytes); err != nil {
		c.log.Error("sizing the snapshot failed", "error", err)
		return
	}
	c.emit(event.TypeWorldSnapshot, at, data)
	c.lastSnapshotAt = at
	c.lastSnapshotPlayers = len(data.Players)
	c.lastPalBoxSig = signature
}

func (c *Collector) restSuccess(at time.Time) {
	c.restLastOK = at
	c.restFailures = 0
	c.restEverOK = true
	c.unauthorizedShown = false
	if !c.serverUp && !c.inflight["info"] {
		c.fetchInfo()
	}
}

func (c *Collector) restFailure(err error) {
	if errors.Is(err, context.Canceled) {
		return
	}
	c.restFailures++
	if errors.Is(err, palrest.ErrUnauthorized) {
		if !c.unauthorizedShown {
			c.unauthorizedShown = true
			c.log.Error("the Palworld REST API refused the admin password; check palworld.admin_password", "error", err)
		}
		return
	}
	if c.restFailures == 1 && c.serverUp {
		c.log.Warn("the Palworld REST API did not answer", "error", err)
	}
}

func (c *Collector) onResult(result restResult) {
	switch result.kind {
	case "info":
		c.startupInfoTried = true
		if result.err != nil {
			c.restFailure(result.err)
			return
		}
		c.restLastOK = result.at
		c.restFailures = 0
		c.restEverOK = true
		info := serverInfo(result.info)
		var settings *event.ServerSettings
		if result.settings != nil {
			settings = curateSettings(result.settings)
		}
		if !c.serverUp {
			c.markOnline(info, settings, result.at)
			return
		}
		if current := c.server.Load(); current != nil && current.WorldGUID != info.WorldGUID {
			c.log.Info("the server switched worlds", "world", info.WorldGUID)
			c.markOffline(event.OfflineUnreachable)
			c.markOnline(info, settings, result.at)
		}
	case "players":
		if result.err != nil {
			c.restFailure(result.err)
			return
		}
		c.restSuccess(result.at)
		c.lastPlayers = result.players
		c.lastPlayersAt = result.at
		_, observations := world.FromPlayers(result.players)
		changes := c.tracker.Presence(observations, !c.logsLive())
		c.emitChanges(changes, result.at)
	case "gamedata":
		if errors.Is(result.err, palrest.ErrGameDataOff) {
			c.restSuccess(result.at)
			if c.gameDataState != gameDataOff {
				c.log.Info("the server's game-data API is off; world snapshots carry players only (start the server with -enable-gamedata-api for pals, bases and deaths)")
			}
			c.gameDataState = gameDataOff
			c.gameDataProbed = true
			c.gameDataNextProbe = result.at.Add(gameDataReprobe)
			c.restSnapshot()
			return
		}
		if result.err != nil {
			c.restFailure(result.err)
			if palrest.IsUnreachable(result.err) || errors.Is(result.err, palrest.ErrUnauthorized) {
				return
			}
			c.gameDataProbed = true
			return
		}
		c.restSuccess(result.at)
		if c.gameDataState != gameDataOK {
			c.log.Info("reading world snapshots from the game-data API")
		}
		c.gameDataState = gameDataOK
		c.gameDataProbed = true
		if !c.serverUp {
			return
		}
		data, observations := world.FromGameData(result.gameData, c.lastPlayers)
		c.emitChanges(c.tracker.Snapshot(observations), result.at)
		c.emitSnapshot(data, result.at)
	case "metrics":
		if result.err != nil {
			c.restFailure(result.err)
			return
		}
		c.restSuccess(result.at)
		metrics := result.metrics
		if c.serverUp && c.lastUptime > 0 && metrics.Uptime+5 < c.lastUptime {
			c.log.Info("the server restarted between polls")
			current := c.server.Load()
			c.markOffline(event.OfflineUnreachable)
			if current != nil {
				c.markOnline(*current, c.settings, result.at)
			}
			c.fetchInfo()
		}
		c.lastUptime = metrics.Uptime
		c.emit(event.TypeServerMetrics, result.at, metricsData(metrics))
	}
}

func (c *Collector) markOnline(info event.ServerInfo, settings *event.ServerSettings, at time.Time) {
	c.serverUp = true
	c.server.Store(&info)
	if settings != nil {
		c.settings = settings
	}
	c.tracker.Reset()
	c.lastUptime = 0
	c.expectShutdown.Store(false)
	c.log.Info("server online", "name", info.Name, "version", info.Version, "world", info.WorldGUID)
	c.emit(event.TypeServerOnline, at, event.ServerOnlineData{ServerInfo: info, Settings: c.settings})
	if !c.gameDataProbed || c.gameDataState == gameDataOK {
		c.fetchGameData()
	}
	c.fetchPlayers()
}

func (c *Collector) markOffline(reason string) {
	if !c.serverUp {
		return
	}
	c.serverUp = false
	c.tracker.Reset()
	c.lastUptime = 0
	c.log.Info("server offline", "reason", reason)
	c.emit(event.TypeServerOffline, time.Now(), event.ServerOfflineData{Reason: reason})
}

func (c *Collector) emitChanges(changes []world.Change, at time.Time) {
	for _, change := range changes {
		if item, ok := changeEmission(change, at); ok {
			c.emit(item.Type, item.At, item.Data)
		}
	}
}

func (c *Collector) logsLive() bool {
	return c.source != nil && c.logState == serverlog.StateConnected && c.logFormat == serverlog.KindJSON
}

func (c *Collector) onLine(line serverlog.Line) {
	c.lastLogLine = time.Now()
	kind, records := serverlog.Classify(line.Text)
	switch kind {
	case serverlog.KindJSON:
		c.logFormat = serverlog.KindJSON
		for _, record := range records {
			at := c.recordTime(record, line)
			for _, item := range c.mapper.Map(record, at) {
				c.emit(item.Type, item.At, item.Data)
			}
		}
	case serverlog.KindText:
		if c.logFormat != serverlog.KindJSON {
			c.logFormat = serverlog.KindText
		}
		if !c.textWarned {
			c.textWarned = true
			c.log.Warn("the server writes text-format logs; set LogFormatType=Json in PalWorldSettings.ini (or start it with -logformat=json) so joins, leaves and chat can be read; until then joins and leaves come from REST")
		}
	default:
		if strings.Contains(line.Text, "REST API stopped") {
			c.expectShutdown.Store(true)
		}
	}
}

func (c *Collector) recordTime(record serverlog.Record, line serverlog.Line) time.Time {
	reference := line.SourceTime
	live := !reference.IsZero()
	if reference.IsZero() {
		reference = line.ReceivedAt
		live = c.launch != nil
	}
	parsed, ok := serverlog.ParseTimestamp(record.Timestamp, c.cfg.Location)
	if !ok {
		return reference
	}
	if live {
		drift := parsed.Sub(reference)
		if drift > 2*time.Minute || drift < -2*time.Minute {
			if !c.clockWarned {
				c.clockWarned = true
				c.log.Warn("log timestamps differ from the clock; check logs.timezone", "timezone", c.cfg.Logs.Timezone, "difference", drift.Round(time.Minute).String())
			}
			return reference
		}
	}
	return parsed
}

func (c *Collector) onSourceState(state sourceState) bool {
	previous := c.logState
	c.logState = state.state
	switch state.state {
	case serverlog.StateConnected:
		if previous != serverlog.StateConnected {
			c.log.Info("reading server logs", "source", c.cfg.Logs.Source)
		}
	case serverlog.StateDown:
		if previous != serverlog.StateDown && state.err != nil {
			c.log.Warn("server logs unavailable; joins and leaves come from REST meanwhile", "error", state.err)
		}
	case serverlog.StateEnded:
		return c.launch != nil || c.cfg.Logs.Source == config.SourceStdin
	}
	return false
}

func (c *Collector) finishProcess() {
	c.ensureStarted()
	reason := event.OfflineShutdown
	if c.launch != nil {
		code, err := c.launch.ExitCode()
		requested := c.stopping || c.expectShutdown.Load()
		switch {
		case err != nil:
			c.exitErr = fmt.Errorf("waiting for the server: %w", err)
		case code != 0 && !requested && !c.killed:
			c.exitErr = fmt.Errorf("the server exited with code %d", code)
			reason = event.OfflineUnreachable
		}
		c.log.Info("the server exited", "code", code)
	} else {
		c.log.Info("the server's output ended")
	}
	if c.serverUp {
		c.markOffline(reason)
	}
}

func (c *Collector) onActionResult(result actionResult) {
	c.ensureStarted()
	if result.Err != nil {
		c.log.Warn("action failed", "id", result.Action.ID, "kind", result.Action.Kind, "error", result.Err)
	} else {
		c.log.Info("action completed", "id", result.Action.ID, "kind", result.Action.Kind)
	}
	item := actionEmission(result, time.Now())
	c.emit(item.Type, item.At, item.Data)
	c.pipe.Wake()
}

func (c *Collector) emitHeartbeat() {
	stats := c.pipe.Stats()
	restState := "down"
	if !c.restLastOK.IsZero() && time.Since(c.restLastOK) < 3*c.cfg.Intervals.Players {
		restState = "ok"
	}
	gameData := "unavailable"
	if restState == "ok" {
		switch c.gameDataState {
		case gameDataOK:
			gameData = "ok"
		case gameDataOff:
			gameData = "off"
		}
	}
	logs := "off"
	if c.cfg.Logs.Source != config.SourceNone {
		switch c.logState {
		case serverlog.StateConnected:
			logs = "idle"
			if !c.lastLogLine.IsZero() && time.Since(c.lastLogLine) < logIdleAfter {
				logs = "ok"
			}
		case serverlog.StateConnecting:
			logs = "idle"
		default:
			logs = "error"
		}
	}
	c.ensureStarted()
	c.emit(event.TypeCollectorHeartbeat, time.Now(), event.CollectorHeartbeatData{
		UptimeS:       time.Since(c.startedAt).Round(time.Millisecond).Seconds(),
		QueueDepth:    stats.Depth,
		DroppedEvents: stats.Dropped,
		Rest:          restState,
		GameData:      gameData,
		Logs:          logs,
	})
}
