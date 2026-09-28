package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
	_ "time/tzdata"

	"github.com/BurntSushi/toml"
)

const DefaultFileName = "skylark-collector.toml"

const (
	SourceLaunch = "launch"
	SourceDocker = "docker"
	SourceFile   = "file"
	SourceStdin  = "stdin"
	SourceNone   = "none"
)

type Site struct {
	URL    string `toml:"url"`
	Secret string `toml:"secret"`
}

type Palworld struct {
	RestURL       string `toml:"rest_url"`
	AdminPassword string `toml:"admin_password"`
	ServerDir     string `toml:"server_dir"`
}

type Logs struct {
	Source   string `toml:"source"`
	Timezone string `toml:"timezone"`
}

type Launch struct {
	Command         string        `toml:"command"`
	Args            []string      `toml:"args"`
	WorkDir         string        `toml:"work_dir"`
	ShutdownWait    time.Duration `toml:"shutdown_wait"`
	ShutdownMessage string        `toml:"shutdown_message"`
	EnableGameData  *bool         `toml:"enable_gamedata"`
}

type Docker struct {
	Container string `toml:"container"`
	Host      string `toml:"host"`
}

type File struct {
	Path string `toml:"path"`
}

type Saves struct {
	Reader   string        `toml:"reader"`
	Dir      string        `toml:"dir"`
	Interval time.Duration `toml:"interval"`
}

type Intervals struct {
	Players      time.Duration `toml:"players"`
	Snapshot     time.Duration `toml:"snapshot"`
	SnapshotIdle time.Duration `toml:"snapshot_idle"`
	Metrics      time.Duration `toml:"metrics"`
	Heartbeat    time.Duration `toml:"heartbeat"`
	Flush        time.Duration `toml:"flush"`
	Actions      time.Duration `toml:"actions"`
}

type Config struct {
	Site       Site      `toml:"site"`
	Palworld   Palworld  `toml:"palworld"`
	Logs       Logs      `toml:"logs"`
	Launch     Launch    `toml:"launch"`
	Docker     Docker    `toml:"docker"`
	File       File      `toml:"file"`
	Intervals  Intervals `toml:"intervals"`
	Saves      Saves     `toml:"saves"`
	SendIPs    bool      `toml:"send_ips"`
	JournalDir string    `toml:"journal_dir"`

	Path      string         `toml:"-"`
	Location  *time.Location `toml:"-"`
	ServerIni *ServerIni     `toml:"-"`
	SaveRoots []string       `toml:"-"`
	Warnings  []string       `toml:"-"`
}

type Options struct {
	Path     string
	Getenv   func(string) string
	ExeDir   string
	DryRun   bool
	Platform string
}

func Load(options Options) (*Config, error) {
	if options.Getenv == nil {
		options.Getenv = os.Getenv
	}
	cfg := &Config{}
	path := options.Path
	explicit := path != ""
	if !explicit && options.ExeDir != "" {
		path = filepath.Join(options.ExeDir, DefaultFileName)
	}
	if path != "" {
		data, err := os.ReadFile(path)
		switch {
		case err == nil:
			meta, decodeErr := toml.Decode(string(data), cfg)
			if decodeErr != nil {
				return nil, fmt.Errorf("%s: %w", path, decodeErr)
			}
			if undecoded := meta.Undecoded(); len(undecoded) > 0 {
				keys := make([]string, 0, len(undecoded))
				for _, key := range undecoded {
					keys = append(keys, key.String())
				}
				return nil, fmt.Errorf("%s: unknown keys: %s", path, strings.Join(keys, ", "))
			}
			cfg.Path = path
		case explicit || !errors.Is(err, fs.ErrNotExist):
			return nil, fmt.Errorf("reading config: %w", err)
		}
	}
	restURLSet := cfg.Palworld.RestURL != ""
	if err := applyEnv(cfg, options.Getenv); err != nil {
		return nil, err
	}
	if cfg.Palworld.RestURL != "" {
		restURLSet = true
	}
	if cfg.Docker.Host == "" {
		cfg.Docker.Host = options.Getenv("DOCKER_HOST")
	}
	applyDefaults(cfg, options)
	if err := derive(cfg, restURLSet, options.Platform); err != nil {
		return nil, err
	}
	if err := validate(cfg, options.DryRun); err != nil {
		return nil, err
	}
	return cfg, nil
}

func applyDefaults(cfg *Config, options Options) {
	cfg.Logs.Source = strings.ToLower(strings.TrimSpace(cfg.Logs.Source))
	if cfg.Logs.Source == "" {
		if cfg.Launch.Command != "" {
			cfg.Logs.Source = SourceLaunch
		} else {
			cfg.Logs.Source = SourceNone
		}
	}
	if cfg.Logs.Timezone == "" {
		if cfg.Logs.Source == SourceDocker {
			cfg.Logs.Timezone = "UTC"
		} else {
			cfg.Logs.Timezone = "Local"
		}
	}
	defaults := []struct {
		target *time.Duration
		value  time.Duration
	}{
		{&cfg.Intervals.Players, 5 * time.Second},
		{&cfg.Intervals.Snapshot, 10 * time.Second},
		{&cfg.Intervals.SnapshotIdle, 60 * time.Second},
		{&cfg.Intervals.Metrics, 30 * time.Second},
		{&cfg.Intervals.Heartbeat, 60 * time.Second},
		{&cfg.Intervals.Flush, 2 * time.Second},
		{&cfg.Intervals.Actions, 5 * time.Second},
		{&cfg.Launch.ShutdownWait, 5 * time.Second},
		{&cfg.Saves.Interval, 5 * time.Minute},
	}
	for _, entry := range defaults {
		if *entry.target == 0 {
			*entry.target = entry.value
		}
	}
	if cfg.Launch.ShutdownMessage == "" {
		cfg.Launch.ShutdownMessage = "The server is shutting down."
	}
	if cfg.Launch.EnableGameData == nil {
		enabled := true
		cfg.Launch.EnableGameData = &enabled
	}
	if cfg.JournalDir == "" {
		base := options.ExeDir
		if cfg.Path != "" {
			base = filepath.Dir(cfg.Path)
		}
		if base == "" {
			base = "."
		}
		cfg.JournalDir = filepath.Join(base, "skylark-journal")
	}
	cfg.Site.URL = strings.TrimSpace(cfg.Site.URL)
	if cfg.Saves.Reader == "" && options.ExeDir != "" {
		cfg.Saves.Reader = findSaveReader(options.ExeDir, options.Platform)
	}
}

func findSaveReader(dir, platform string) string {
	goos := platform
	if goos == "" {
		goos = runtime.GOOS
	}
	suffix := ""
	if goos == "windows" {
		suffix = ".exe"
	}
	for _, name := range []string{"skylark-savereader" + suffix, "skylark-savereader-" + goos + "-" + runtime.GOARCH + suffix} {
		candidate := filepath.Join(dir, name)
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate
		}
	}
	return ""
}

func derive(cfg *Config, restURLSet bool, platform string) error {
	location, err := time.LoadLocation(cfg.Logs.Timezone)
	if err != nil {
		return fmt.Errorf("logs.timezone %q: %w", cfg.Logs.Timezone, err)
	}
	cfg.Location = location
	launch := ParseLaunchArgs(cfg.Launch.Args)
	if cfg.Palworld.ServerDir != "" || launch.UserDir != "" {
		ini, err := FindServerIni(cfg.Palworld.ServerDir, launch.UserDir, platform)
		if err != nil {
			cfg.Warnings = append(cfg.Warnings, err.Error())
		} else {
			cfg.ServerIni = ini
		}
	}
	password := cfg.Palworld.AdminPassword
	if password == "" && cfg.Logs.Source == SourceLaunch && launch.AdminPassword != "" {
		password = launch.AdminPassword
	}
	if password == "" && cfg.ServerIni != nil {
		password = cfg.ServerIni.AdminPassword
	}
	cfg.Palworld.AdminPassword = password
	switch {
	case cfg.Saves.Dir != "":
		cfg.SaveRoots = []string{cfg.Saves.Dir}
	default:
		if launch.UserDir != "" {
			cfg.SaveRoots = append(cfg.SaveRoots, filepath.Join(launch.UserDir, "Saved"))
		}
		if cfg.Palworld.ServerDir != "" {
			cfg.SaveRoots = append(cfg.SaveRoots, filepath.Join(cfg.Palworld.ServerDir, "Pal", "Saved"))
		}
	}
	if cfg.Saves.Reader != "" {
		if _, err := os.Stat(cfg.Saves.Reader); err != nil {
			cfg.Warnings = append(cfg.Warnings, fmt.Sprintf("saves.reader %s: %v; the world save is not read", cfg.Saves.Reader, err))
			cfg.Saves.Reader = ""
		} else if len(cfg.SaveRoots) == 0 {
			cfg.Warnings = append(cfg.Warnings, "the save reader is here but the world save folder is unknown; set saves.dir (or palworld.server_dir) so the collector can read it")
		}
	}
	if !restURLSet {
		port := 8212
		if cfg.ServerIni != nil && cfg.ServerIni.RESTAPIPort > 0 {
			port = cfg.ServerIni.RESTAPIPort
		}
		if cfg.Logs.Source == SourceLaunch && launch.RESTAPIPort > 0 {
			port = launch.RESTAPIPort
		}
		cfg.Palworld.RestURL = "http://127.0.0.1:" + strconv.Itoa(port)
	}
	if cfg.ServerIni != nil {
		restOn := cfg.ServerIni.RESTAPIEnabled
		if cfg.Logs.Source == SourceLaunch && launch.RESTAPI {
			restOn = true
		}
		if !restOn {
			cfg.Warnings = append(cfg.Warnings, fmt.Sprintf("%s has RESTAPIEnabled=False; the collector needs the REST API (set RESTAPIEnabled=True or pass -restapi)", cfg.ServerIni.Path))
		}
		format := strings.ToLower(cfg.ServerIni.LogFormatType)
		if cfg.Logs.Source == SourceLaunch && launch.LogFormat != "" {
			format = strings.ToLower(launch.LogFormat)
		}
		if cfg.Logs.Source != SourceNone && cfg.Logs.Source != SourceLaunch && format != "" && format != "json" {
			cfg.Warnings = append(cfg.Warnings, fmt.Sprintf("%s has LogFormatType=%s; set LogFormatType=Json so the collector can read joins, leaves and chat from the log", cfg.ServerIni.Path, cfg.ServerIni.LogFormatType))
		}
	}
	return nil
}

func validate(cfg *Config, dryRun bool) error {
	var problems []string
	if !dryRun {
		if cfg.Site.URL == "" {
			problems = append(problems, "site.url is required")
		} else if parsed, err := url.Parse(cfg.Site.URL); err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
			problems = append(problems, fmt.Sprintf("site.url %q must be an http or https URL", cfg.Site.URL))
		}
		if cfg.Site.Secret == "" {
			problems = append(problems, "site.secret is required")
		}
	}
	if parsed, err := url.Parse(cfg.Palworld.RestURL); err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		problems = append(problems, fmt.Sprintf("palworld.rest_url %q must be an http or https URL", cfg.Palworld.RestURL))
	}
	if cfg.Palworld.AdminPassword == "" {
		problems = append(problems, "palworld.admin_password is required; set it, or set palworld.server_dir so it is read from PalWorldSettings.ini")
	}
	switch cfg.Logs.Source {
	case SourceLaunch:
		if cfg.Launch.Command == "" {
			problems = append(problems, "logs.source is launch but launch.command is empty")
		}
	case SourceDocker:
		if cfg.Docker.Container == "" {
			problems = append(problems, "logs.source is docker but docker.container is empty")
		}
	case SourceFile:
		if cfg.File.Path == "" {
			problems = append(problems, "logs.source is file but file.path is empty")
		}
	case SourceStdin, SourceNone:
	default:
		problems = append(problems, fmt.Sprintf("logs.source %q must be launch, docker, file, stdin or none", cfg.Logs.Source))
	}
	intervals := []struct {
		name  string
		value time.Duration
	}{
		{"intervals.players", cfg.Intervals.Players},
		{"intervals.snapshot", cfg.Intervals.Snapshot},
		{"intervals.snapshot_idle", cfg.Intervals.SnapshotIdle},
		{"intervals.metrics", cfg.Intervals.Metrics},
		{"intervals.heartbeat", cfg.Intervals.Heartbeat},
		{"intervals.flush", cfg.Intervals.Flush},
		{"intervals.actions", cfg.Intervals.Actions},
		{"launch.shutdown_wait", cfg.Launch.ShutdownWait},
		{"saves.interval", cfg.Saves.Interval},
	}
	for _, interval := range intervals {
		if interval.value < time.Second {
			problems = append(problems, fmt.Sprintf("%s must be at least 1s (use a duration string such as \"5s\")", interval.name))
		}
	}
	if cfg.Saves.Interval < 30*time.Second {
		problems = append(problems, "saves.interval must be at least 30s; the save reader reads the whole world")
	}
	if cfg.Intervals.Heartbeat > 150*time.Second {
		problems = append(problems, "intervals.heartbeat must be at most 150s; the site declares a collector lost after 180s without a batch")
	}
	if len(problems) > 0 {
		return errors.New(strings.Join(problems, "; "))
	}
	if cfg.Intervals.Snapshot > 12*time.Second {
		cfg.Warnings = append(cfg.Warnings, "intervals.snapshot is above 12s; a death shows in the game data for about 13s, so some deaths may be missed")
	}
	return nil
}

func (cfg *Config) IngestURL() string {
	trimmed := strings.TrimRight(cfg.Site.URL, "/")
	if strings.HasSuffix(trimmed, "/api/ingest") {
		return trimmed
	}
	return trimmed + "/api/ingest"
}

type envSetter struct {
	name  string
	apply func(cfg *Config, value string) error
}

func stringSetter(name string, target func(cfg *Config) *string) envSetter {
	return envSetter{name, func(cfg *Config, value string) error {
		*target(cfg) = value
		return nil
	}}
}

func durationSetter(name string, target func(cfg *Config) *time.Duration) envSetter {
	return envSetter{name, func(cfg *Config, value string) error {
		parsed, err := time.ParseDuration(value)
		if err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
		*target(cfg) = parsed
		return nil
	}}
}

func boolSetter(name string, target func(cfg *Config) *bool) envSetter {
	return envSetter{name, func(cfg *Config, value string) error {
		parsed, err := strconv.ParseBool(value)
		if err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
		*target(cfg) = parsed
		return nil
	}}
}

var envSetters = []envSetter{
	stringSetter("SKYLARK_SITE_URL", func(c *Config) *string { return &c.Site.URL }),
	stringSetter("SKYLARK_SITE_SECRET", func(c *Config) *string { return &c.Site.Secret }),
	stringSetter("SKYLARK_PALWORLD_REST_URL", func(c *Config) *string { return &c.Palworld.RestURL }),
	stringSetter("SKYLARK_PALWORLD_ADMIN_PASSWORD", func(c *Config) *string { return &c.Palworld.AdminPassword }),
	stringSetter("SKYLARK_PALWORLD_SERVER_DIR", func(c *Config) *string { return &c.Palworld.ServerDir }),
	stringSetter("SKYLARK_LOGS_SOURCE", func(c *Config) *string { return &c.Logs.Source }),
	stringSetter("SKYLARK_LOGS_TIMEZONE", func(c *Config) *string { return &c.Logs.Timezone }),
	stringSetter("SKYLARK_LAUNCH_COMMAND", func(c *Config) *string { return &c.Launch.Command }),
	{"SKYLARK_LAUNCH_ARGS", func(c *Config, value string) error {
		args, err := SplitArgs(value)
		if err != nil {
			return fmt.Errorf("SKYLARK_LAUNCH_ARGS: %w", err)
		}
		c.Launch.Args = args
		return nil
	}},
	stringSetter("SKYLARK_LAUNCH_WORK_DIR", func(c *Config) *string { return &c.Launch.WorkDir }),
	durationSetter("SKYLARK_LAUNCH_SHUTDOWN_WAIT", func(c *Config) *time.Duration { return &c.Launch.ShutdownWait }),
	stringSetter("SKYLARK_LAUNCH_SHUTDOWN_MESSAGE", func(c *Config) *string { return &c.Launch.ShutdownMessage }),
	{"SKYLARK_LAUNCH_ENABLE_GAMEDATA", func(c *Config, value string) error {
		parsed, err := strconv.ParseBool(value)
		if err != nil {
			return fmt.Errorf("SKYLARK_LAUNCH_ENABLE_GAMEDATA: %w", err)
		}
		c.Launch.EnableGameData = &parsed
		return nil
	}},
	stringSetter("SKYLARK_DOCKER_CONTAINER", func(c *Config) *string { return &c.Docker.Container }),
	stringSetter("SKYLARK_DOCKER_HOST", func(c *Config) *string { return &c.Docker.Host }),
	stringSetter("SKYLARK_FILE_PATH", func(c *Config) *string { return &c.File.Path }),
	durationSetter("SKYLARK_INTERVALS_PLAYERS", func(c *Config) *time.Duration { return &c.Intervals.Players }),
	durationSetter("SKYLARK_INTERVALS_SNAPSHOT", func(c *Config) *time.Duration { return &c.Intervals.Snapshot }),
	durationSetter("SKYLARK_INTERVALS_SNAPSHOT_IDLE", func(c *Config) *time.Duration { return &c.Intervals.SnapshotIdle }),
	durationSetter("SKYLARK_INTERVALS_METRICS", func(c *Config) *time.Duration { return &c.Intervals.Metrics }),
	durationSetter("SKYLARK_INTERVALS_HEARTBEAT", func(c *Config) *time.Duration { return &c.Intervals.Heartbeat }),
	durationSetter("SKYLARK_INTERVALS_FLUSH", func(c *Config) *time.Duration { return &c.Intervals.Flush }),
	durationSetter("SKYLARK_INTERVALS_ACTIONS", func(c *Config) *time.Duration { return &c.Intervals.Actions }),
	stringSetter("SKYLARK_SAVES_READER", func(c *Config) *string { return &c.Saves.Reader }),
	stringSetter("SKYLARK_SAVES_DIR", func(c *Config) *string { return &c.Saves.Dir }),
	durationSetter("SKYLARK_SAVES_INTERVAL", func(c *Config) *time.Duration { return &c.Saves.Interval }),
	boolSetter("SKYLARK_SEND_IPS", func(c *Config) *bool { return &c.SendIPs }),
	stringSetter("SKYLARK_JOURNAL_DIR", func(c *Config) *string { return &c.JournalDir }),
}

func applyEnv(cfg *Config, getenv func(string) string) error {
	for _, setter := range envSetters {
		value, present := lookup(getenv, setter.name)
		if !present {
			continue
		}
		if err := setter.apply(cfg, value); err != nil {
			return err
		}
	}
	return nil
}

func lookup(getenv func(string) string, name string) (string, bool) {
	value := getenv(name)
	if value == "" {
		return "", false
	}
	return value, true
}

func SplitArgs(value string) ([]string, error) {
	trimmed := strings.TrimSpace(value)
	if strings.HasPrefix(trimmed, "[") {
		var args []string
		if err := json.Unmarshal([]byte(trimmed), &args); err != nil {
			return nil, err
		}
		return args, nil
	}
	var args []string
	var current strings.Builder
	inQuotes := false
	hasToken := false
	for _, r := range trimmed {
		switch {
		case r == '"':
			inQuotes = !inQuotes
			hasToken = true
		case (r == ' ' || r == '\t') && !inQuotes:
			if hasToken {
				args = append(args, current.String())
				current.Reset()
				hasToken = false
			}
		default:
			current.WriteRune(r)
			hasToken = true
		}
	}
	if inQuotes {
		return nil, errors.New("unterminated quote")
	}
	if hasToken {
		args = append(args, current.String())
	}
	return args, nil
}
