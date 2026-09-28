package logfile

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestFileRotatesAtTheLimit(t *testing.T) {
	path := filepath.Join(t.TempDir(), "logs", "collector.log")
	file, err := Open(path, 64)
	if err != nil {
		t.Fatal(err)
	}
	line := strings.Repeat("a", 30) + "\n"
	for range 3 {
		if _, err := file.Write([]byte(line)); err != nil {
			t.Fatal(err)
		}
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	current, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	previous, err := os.ReadFile(path + ".1")
	if err != nil {
		t.Fatal(err)
	}
	if string(current) != line || string(previous) != line+line {
		t.Fatalf("current %q previous %q", current, previous)
	}
}

func TestFileAppendsAcrossOpens(t *testing.T) {
	path := filepath.Join(t.TempDir(), "server.log")
	for _, text := range []string{"first\n", "second\n"} {
		file, err := Open(path, 1<<20)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := file.Write([]byte(text)); err != nil {
			t.Fatal(err)
		}
		file.Close()
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "first\nsecond\n" {
		t.Fatalf("got %q", data)
	}
	file, err := Open(path, 1<<20)
	if err != nil {
		t.Fatal(err)
	}
	file.Close()
	if _, err := file.Write([]byte("late\n")); err == nil {
		t.Fatal("a write after close succeeded")
	}
}
