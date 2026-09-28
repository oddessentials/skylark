package winservice

import (
	"context"
	"errors"
	"fmt"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/mgr"
)

const preshutdownTimeout = 3 * time.Minute

type preshutdownInfo struct {
	timeout uint32
}

func init() {
	isService = detect
	runService = runWindows
	installFunc = install
	removeFunc = remove
	startFunc = start
	stopFunc = stop
}

func detect() bool {
	service, err := svc.IsWindowsService()
	return err == nil && service
}

type handler struct {
	run RunFunc
	err error
}

func (h *handler) Execute(_ []string, requests <-chan svc.ChangeRequest, status chan<- svc.Status) (bool, uint32) {
	status <- svc.Status{State: svc.StartPending}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	force := make(chan struct{}, 1)
	done := make(chan error, 1)
	go func() {
		done <- h.run(ctx, force)
	}()
	status <- svc.Status{State: svc.Running, Accepts: svc.AcceptStop | svc.AcceptShutdown | svc.AcceptPreShutdown}
	var pulse <-chan time.Time
	var checkpoint uint32
	stopPending := func() {
		checkpoint++
		status <- svc.Status{State: svc.StopPending, CheckPoint: checkpoint, WaitHint: uint32(stopWaitHint / time.Millisecond)}
	}
	for {
		select {
		case err := <-done:
			h.err = err
			if err != nil {
				return true, 1
			}
			return false, 0
		case request := <-requests:
			switch request.Cmd {
			case svc.Interrogate:
				status <- request.CurrentStatus
			case svc.Stop, svc.Shutdown, svc.PreShutdown:
				if pulse == nil {
					cancel()
					ticker := time.NewTicker(pulseEvery)
					defer ticker.Stop()
					pulse = ticker.C
				}
				stopPending()
			}
		case <-pulse:
			stopPending()
		}
	}
}

func runWindows(name string, run RunFunc) error {
	h := &handler{run: run}
	if err := svc.Run(name, h); err != nil {
		return err
	}
	return h.err
}

func connect() (*mgr.Mgr, error) {
	m, err := mgr.Connect()
	if err != nil {
		if errors.Is(err, windows.ERROR_ACCESS_DENIED) {
			return nil, errors.New("the service manager refused access; run this from a terminal opened with Run as administrator")
		}
		return nil, fmt.Errorf("connecting to the service manager: %w", err)
	}
	return m, nil
}

func install(options InstallOptions) error {
	m, err := connect()
	if err != nil {
		return err
	}
	defer m.Disconnect()
	if existing, err := m.OpenService(options.Name); err == nil {
		existing.Close()
		return fmt.Errorf("a service named %s already exists; remove it first with: skylark-collector service remove --name %s", options.Name, options.Name)
	}
	service, err := m.CreateService(options.Name, options.Executable, mgr.Config{
		DisplayName: DisplayName(options.Name),
		Description: "Runs the Palworld server and reports it to its Skylark site. Stopping the service saves the world and shuts the server down.",
		StartType:   mgr.StartAutomatic,
	}, "run", "--config", options.ConfigPath)
	if err != nil {
		return fmt.Errorf("creating the service: %w", err)
	}
	defer service.Close()
	cleanup := func(cause error) error {
		service.Delete()
		return cause
	}
	actions := []mgr.RecoveryAction{
		{Type: mgr.ServiceRestart, Delay: 10 * time.Second},
		{Type: mgr.ServiceRestart, Delay: 30 * time.Second},
		{Type: mgr.ServiceRestart, Delay: 60 * time.Second},
	}
	if err := service.SetRecoveryActions(actions, uint32((24 * time.Hour).Seconds())); err != nil {
		return cleanup(fmt.Errorf("setting the restart on failure: %w", err))
	}
	if err := service.SetRecoveryActionsOnNonCrashFailures(true); err != nil {
		return cleanup(fmt.Errorf("setting the restart on failure: %w", err))
	}
	info := preshutdownInfo{timeout: uint32(preshutdownTimeout / time.Millisecond)}
	if err := windows.ChangeServiceConfig2(service.Handle, windows.SERVICE_CONFIG_PRESHUTDOWN_INFO, (*byte)(unsafe.Pointer(&info))); err != nil {
		return cleanup(fmt.Errorf("setting the time allowed at Windows shutdown: %w", err))
	}
	return nil
}

func open(name string) (*mgr.Mgr, *mgr.Service, error) {
	m, err := connect()
	if err != nil {
		return nil, nil, err
	}
	service, err := m.OpenService(name)
	if err != nil {
		m.Disconnect()
		if errors.Is(err, windows.ERROR_SERVICE_DOES_NOT_EXIST) {
			return nil, nil, fmt.Errorf("there is no service named %s", name)
		}
		return nil, nil, fmt.Errorf("opening the service %s: %w", name, err)
	}
	return m, service, nil
}

func start(name string) error {
	m, service, err := open(name)
	if err != nil {
		return err
	}
	defer m.Disconnect()
	defer service.Close()
	if err := service.Start(); err != nil {
		return fmt.Errorf("starting the service %s: %w", name, err)
	}
	return nil
}

func stop(name string, progress func(string)) error {
	m, service, err := open(name)
	if err != nil {
		return err
	}
	defer m.Disconnect()
	defer service.Close()
	return stopAndWait(service, progress)
}

func stopAndWait(service *mgr.Service, progress func(string)) error {
	status, err := service.Query()
	if err != nil {
		return fmt.Errorf("querying the service: %w", err)
	}
	if status.State == svc.Stopped {
		return nil
	}
	if status.State != svc.StopPending {
		if status, err = service.Control(svc.Stop); err != nil {
			return fmt.Errorf("stopping the service: %w", err)
		}
	}
	if progress != nil {
		progress("waiting for the server to save and shut down")
	}
	deadline := time.Now().Add(stopTimeout)
	for status.State != svc.Stopped {
		if time.Now().After(deadline) {
			return fmt.Errorf("the service did not stop within %s", stopTimeout)
		}
		time.Sleep(time.Second)
		if status, err = service.Query(); err != nil {
			return fmt.Errorf("querying the service: %w", err)
		}
	}
	return nil
}

func remove(name string, progress func(string)) error {
	m, service, err := open(name)
	if err != nil {
		return err
	}
	defer m.Disconnect()
	defer service.Close()
	if err := stopAndWait(service, progress); err != nil {
		return err
	}
	if err := service.Delete(); err != nil {
		return fmt.Errorf("removing the service: %w", err)
	}
	return nil
}
