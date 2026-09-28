package serverlog

import (
	"context"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"
)

func TestConPTYDeliversLinesPromptly(t *testing.T) {
	if os.Getenv("SKYLARK_CONPTY_HELPER") == "1" {
		fmt.Println("Game version is v1.0.5.102999")
		fmt.Println("{\t\"timestamp\": \"2026-09-27 22:19:11\",\t\"event\": \"join\",\t\"playername\": \"Wanderer\",\t\"userid\": \"steam_76561190000000101\",\t\"playerid\": \"5E7A11C0000000000000000000000000\",\t\"details\": [] }")
		time.Sleep(300 * time.Millisecond)
		fmt.Println("REST API stopped")
		os.Exit(0)
	}
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	os.Setenv("SKYLARK_CONPTY_HELPER", "1")
	defer os.Unsetenv("SKYLARK_CONPTY_HELPER")
	process, err := StartProcess(LaunchSpec{Command: executable, Args: []string{"-test.run=TestConPTYDeliversLinesPromptly"}})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := process.(*conptyProcess); !ok {
		t.Fatalf("expected a pseudo console process on Windows, got %T", process)
	}
	source := NewLaunchSource(process, nil)
	sink := &recordingSink{}
	done := make(chan struct{})
	go func() {
		source.Run(context.Background(), sink)
		close(done)
	}()
	waitFor(t, "the join line while the process still runs", func() bool {
		for _, text := range sink.texts() {
			if strings.Contains(text, `"event": "join"`) {
				return true
			}
		}
		return false
	})
	select {
	case <-done:
	case <-time.After(20 * time.Second):
		t.Fatal("the launch source did not end")
	}
	joined := strings.Join(sink.texts(), "\n")
	if !strings.Contains(joined, "Game version is v1.0.5.102999") || !strings.Contains(joined, "REST API stopped") {
		t.Fatalf("output %q", joined)
	}
	var join []Record
	for _, text := range sink.texts() {
		if kind, records := Classify(text); kind == KindJSON {
			join = append(join, records...)
		}
	}
	if len(join) != 1 || join[0].PlayerID != "5E7A11C0000000000000000000000000" {
		t.Fatalf("records %+v", join)
	}
	if code, err := source.ExitCode(); code != 0 || err != nil {
		t.Fatalf("exit %d %v", code, err)
	}
}
