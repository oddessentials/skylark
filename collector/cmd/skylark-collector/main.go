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
)

const usage = `skylark-collector %s

Usage:
  skylark-collector [run] [--config FILE] [--dry-run] [--verbose]
  skylark-collector check [--config FILE]
  skylark-collector version

Reads skylark-collector.toml beside the binary unless --config is given; SKYLARK_* environment variables override the file.
`

func main() {
	os.Exit(run(os.Args[1:]))
}

func run(args []string) int {
	command := "run"
	if len(args) > 0 && (args[0] == "run" || args[0] == "check" || args[0] == "version" || args[0] == "help") {
		command = args[0]
		args = args[1:]
	}
	switch command {
	case "version":
		fmt.Println(buildinfo.Version)
		return 0
	case "help":
		fmt.Printf(usage, buildinfo.Version)
		return 0
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
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: level}))
	exeDir := ""
	if executable, err := os.Executable(); err == nil {
		if resolved, err := filepath.EvalSymlinks(executable); err == nil {
			executable = resolved
		}
		exeDir = filepath.Dir(executable)
	}
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
	stdout := io.Writer(os.Stdout)
	if *dryRun {
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
