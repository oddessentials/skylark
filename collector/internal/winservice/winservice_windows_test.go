package winservice

import (
	"context"
	"errors"
	"testing"
	"time"

	"golang.org/x/sys/windows/svc"
)

type execution struct {
	requests chan svc.ChangeRequest
	status   chan svc.Status
	result   chan [2]any
}

func execute(t *testing.T, run RunFunc) *execution {
	t.Helper()
	e := &execution{
		requests: make(chan svc.ChangeRequest),
		status:   make(chan svc.Status, 64),
		result:   make(chan [2]any, 1),
	}
	h := &handler{run: run}
	go func() {
		specific, code := h.Execute(nil, e.requests, e.status)
		e.result <- [2]any{specific, code}
	}()
	return e
}

func (e *execution) next(t *testing.T) svc.Status {
	t.Helper()
	select {
	case status := <-e.status:
		return status
	case <-time.After(5 * time.Second):
		t.Fatal("no status reported")
		return svc.Status{}
	}
}

func (e *execution) finished(t *testing.T) (bool, uint32) {
	t.Helper()
	select {
	case result := <-e.result:
		return result[0].(bool), result[1].(uint32)
	case <-time.After(5 * time.Second):
		t.Fatal("Execute did not return")
		return false, 0
	}
}

func TestStopCancelsTheRunAndReportsProgress(t *testing.T) {
	previous := pulseEvery
	pulseEvery = 20 * time.Millisecond
	defer func() { pulseEvery = previous }()
	release := make(chan struct{})
	e := execute(t, func(ctx context.Context, force <-chan struct{}) error {
		<-ctx.Done()
		<-release
		return nil
	})
	if status := e.next(t); status.State != svc.StartPending {
		t.Fatalf("first status %+v", status)
	}
	running := e.next(t)
	want := svc.AcceptStop | svc.AcceptShutdown | svc.AcceptPreShutdown
	if running.State != svc.Running || running.Accepts != want {
		t.Fatalf("running status %+v", running)
	}
	e.requests <- svc.ChangeRequest{Cmd: svc.Interrogate, CurrentStatus: running}
	if echoed := e.next(t); echoed != running {
		t.Fatalf("interrogate answered %+v", echoed)
	}
	e.requests <- svc.ChangeRequest{Cmd: svc.PreShutdown}
	first := e.next(t)
	second := e.next(t)
	if first.State != svc.StopPending || second.State != svc.StopPending || second.CheckPoint <= first.CheckPoint || first.WaitHint == 0 {
		t.Fatalf("stop progress %+v then %+v", first, second)
	}
	close(release)
	if specific, code := e.finished(t); specific || code != 0 {
		t.Fatalf("exit %v %d", specific, code)
	}
}

func TestAFailedRunEndsWithAServiceSpecificCode(t *testing.T) {
	e := execute(t, func(ctx context.Context, force <-chan struct{}) error {
		return errors.New("the server exited with code 3")
	})
	e.next(t)
	e.next(t)
	if specific, code := e.finished(t); !specific || code != 1 {
		t.Fatalf("exit %v %d", specific, code)
	}
}

func TestARunThatEndsOnItsOwnStopsCleanly(t *testing.T) {
	e := execute(t, func(ctx context.Context, force <-chan struct{}) error {
		return nil
	})
	e.next(t)
	e.next(t)
	if specific, code := e.finished(t); specific || code != 0 {
		t.Fatalf("exit %v %d", specific, code)
	}
}
