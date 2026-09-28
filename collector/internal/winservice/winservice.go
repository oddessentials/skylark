package winservice

import (
	"context"
	"errors"
	"time"
)

const DefaultName = "SkylarkCollector"

var ErrUnsupported = errors.New("Windows services exist only on Windows; run the collector under systemd, Docker or your host's process manager instead")

type RunFunc func(ctx context.Context, force <-chan struct{}) error

type InstallOptions struct {
	Name       string
	Executable string
	ConfigPath string
}

var (
	isService    = func() bool { return false }
	runService   = func(name string, run RunFunc) error { return ErrUnsupported }
	installFunc  = func(options InstallOptions) error { return ErrUnsupported }
	removeFunc   = func(name string, progress func(string)) error { return ErrUnsupported }
	startFunc    = func(name string) error { return ErrUnsupported }
	stopFunc     = func(name string, progress func(string)) error { return ErrUnsupported }
	stopTimeout  = 4 * time.Minute
	pulseEvery   = 2 * time.Second
	stopWaitHint = 30 * time.Second
)

func IsService() bool {
	return isService()
}

func Run(name string, run RunFunc) error {
	return runService(name, run)
}

func Install(options InstallOptions) error {
	if options.Name == "" {
		options.Name = DefaultName
	}
	return installFunc(options)
}

func Remove(name string, progress func(string)) error {
	return removeFunc(orDefault(name), progress)
}

func Start(name string) error {
	return startFunc(orDefault(name))
}

func Stop(name string, progress func(string)) error {
	return stopFunc(orDefault(name), progress)
}

func DisplayName(name string) string {
	if name == "" || name == DefaultName {
		return "Skylark collector"
	}
	return "Skylark collector (" + name + ")"
}

func orDefault(name string) string {
	if name == "" {
		return DefaultName
	}
	return name
}
