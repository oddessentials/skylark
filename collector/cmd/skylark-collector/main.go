package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"github.com/oddessentials/skylark/collector/internal/buildinfo"
	"github.com/oddessentials/skylark/collector/internal/collector"
	"github.com/oddessentials/skylark/collector/internal/config"
	"github.com/oddessentials/skylark/collector/internal/logfile"
	"github.com/oddessentials/skylark/collector/internal/winservice"
)

const usage = `skylark-collector %s

Usage:
  skylark-collector [run] [--config FILE] [--dry-run] [--verbose]
  skylark-collector check [--config FILE]
  skylark-collector service install [--config FILE] [--name NAME]
  skylark-collector service start|stop|remove [--name NAME]
  skylark-collector version

Reads skylark-collector.toml beside the binary unless --config is given; SKYLARK_* environment variables override the file.
On Windows, service install registers the collector as a service that starts with Windows and restarts after a failure. Stopping it saves the world and shuts the server down.
`

const (
	collectorLogName = "skylark-collector.log"
	serverLogName    = "palworld-server.log"
	logLimit         = 10 << 20
)

func main() {
	os.Exit(run(os.Args[1:]))
}

func executableDir() string {
	executable, err := os.Executable()
	if err != nil {
		return ""
	}
	if resolved, err := filepath.EvalSymlinks(executable); err == nil {
		executable = resolved
	}
	return filepath.Dir(executable)
}

func run(args []string) int {
	command := "run"
	if len(args) > 0 {
		switch args[0] {
		case "run", "check", "version", "help", "service":
			command = args[0]
			args = args[1:]
		}
	}
	switch command {
	case "version":
		fmt.Println(buildinfo.Version)
		return 0
	case "help":
		fmt.Printf(usage, buildinfo.Version)
		return 0
	case "service":
		return service(args)
	}
	flags := flag.NewFlagSet("skylark-collector", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	flags.Usage = func() { fmt.Fprintf(os.Stderr, usage, buildinfo.Version) }
	configPath := flags.String("config", "", "configuration file")
	dryRun := flags.Bool("dry-run", false, "print batches to stdout instead of sending them")
	verbose := flags.Bool("verbose", false, "log debug details")
	if err := flags.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return 0
		}
		return 2
	}
	level := slog.LevelInfo
	if *verbose {
		level = slog.LevelDebug
	}
	exeDir := executableDir()
	asService := command == "run" && winservice.IsService()
	logOutput := io.Writer(os.Stderr)
	stdout := io.Writer(os.Stdout)
	if asService {
		logDir := exeDir
		if *configPath != "" {
			if absolute, err := filepath.Abs(*configPath); err == nil {
				logDir = filepath.Dir(absolute)
			}
		}
		collectorLog, err := logfile.Open(filepath.Join(logDir, collectorLogName), logLimit)
		if err != nil {
			return 1
		}
		defer collectorLog.Close()
		serverLog, err := logfile.Open(filepath.Join(logDir, serverLogName), logLimit)
		if err != nil {
			return 1
		}
		defer serverLog.Close()
		logOutput = collectorLog
		stdout = serverLog
	}
	logger := slog.New(slog.NewTextHandler(logOutput, &slog.HandlerOptions{Level: level}))
	cfg, err := config.Load(config.Options{Path: *configPath, ExeDir: exeDir, DryRun: *dryRun})
	if err != nil {
		logger.Error("configuration", "error", err)
		return 2
	}
	if cfg.Path != "" {
		logger.Info("configuration loaded", "file", cfg.Path)
	} else {
		logger.Info("no configuration file; using environment variables only")
	}
	for _, warning := range cfg.Warnings {
		logger.Warn(warning)
	}
	if command == "check" {
		return collector.Check(context.Background(), cfg, os.Stdout)
	}
	var dryRunOut io.Writer
	if *dryRun && !asService {
		dryRunOut = os.Stdout
		stdout = os.Stderr
	}
	instance, err := collector.New(collector.Options{
		Config: cfg,
		Logger: logger,
		Stdout: stdout,
		Stdin:  os.Stdin,
		DryRun: dryRunOut,
	})
	if err != nil {
		logger.Error("starting", "error", err)
		return 1
	}
	if asService {
		logger.Info("running as a Windows service")
		if err := winservice.Run(winservice.DefaultName, instance.Run); err != nil {
			logger.Error("stopped", "error", err)
			return 1
		}
		logger.Info("stopped")
		return 0
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	force := make(chan struct{}, 1)
	signals := make(chan os.Signal, 2)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-signals
		logger.Info("stop requested; press Ctrl+C again to stop at once")
		cancel()
		<-signals
		force <- struct{}{}
	}()
	if err := instance.Run(ctx, force); err != nil {
		logger.Error("stopped", "error", err)
		return 1
	}
	logger.Info("stopped")
	return 0
}

func service(args []string) int {
	if len(args) == 0 {
		fmt.Fprintf(os.Stderr, usage, buildinfo.Version)
		return 2
	}
	action := args[0]
	flags := flag.NewFlagSet("skylark-collector service "+action, flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	name := flags.String("name", winservice.DefaultName, "service name, to run more than one collector")
	configPath := flags.String("config", "", "configuration file (install only)")
	if err := flags.Parse(args[1:]); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return 0
		}
		return 2
	}
	progress := func(message string) { fmt.Println(message) }
	switch action {
	case "install":
		return installService(*name, *configPath)
	case "start":
		if err := winservice.Start(*name); err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 1
		}
		fmt.Printf("started %s\n", *name)
	case "stop":
		if err := winservice.Stop(*name, progress); err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 1
		}
		fmt.Printf("stopped %s\n", *name)
	case "remove":
		if err := winservice.Remove(*name, progress); err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 1
		}
		fmt.Printf("removed %s\n", *name)
	default:
		fmt.Fprintf(os.Stderr, "unknown service command %q\n", action)
		fmt.Fprintf(os.Stderr, usage, buildinfo.Version)
		return 2
	}
	return 0
}

func installService(name, configPath string) int {
	exeDir := executableDir()
	executable, err := os.Executable()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	if resolved, err := filepath.EvalSymlinks(executable); err == nil {
		executable = resolved
	}
	if configPath == "" {
		configPath = filepath.Join(exeDir, config.DefaultFileName)
	}
	absolute, err := filepath.Abs(configPath)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	cfg, err := config.Load(config.Options{Path: absolute, ExeDir: exeDir, Getenv: func(string) string { return "" }})
	if err != nil {
		fmt.Fprintf(os.Stderr, "the service reads only its configuration file, and it is not ready: %v\n", err)
		return 2
	}
	for _, warning := range cfg.Warnings {
		fmt.Fprintf(os.Stderr, "warning: %s\n", warning)
	}
	if err := winservice.Install(winservice.InstallOptions{Name: name, Executable: executable, ConfigPath: absolute}); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	logDir := filepath.Dir(absolute)
	fmt.Printf("installed %s (%s) with %s\n", name, winservice.DisplayName(name), absolute)
	fmt.Printf("it starts with Windows and restarts after a failure; start it now with: skylark-collector service start --name %s\n", name)
	fmt.Printf("logs: %s and %s\n", filepath.Join(logDir, collectorLogName), filepath.Join(logDir, serverLogName))
	return 0
}
