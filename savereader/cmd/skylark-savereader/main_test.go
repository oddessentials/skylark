package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func copyFixture(t *testing.T, from, to string) {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "internal", "gvas", "testdata", from))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(to, data, 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestReadPrintsTheWorldAsJSON(t *testing.T) {
	dir := t.TempDir()
	copyFixture(t, "Level.gvas", filepath.Join(dir, "Level.sav"))
	var stdout, stderr bytes.Buffer
	if code := run([]string{"read", dir}, &stdout, &stderr); code != 0 {
		t.Fatalf("exit %d: %s", code, stderr.String())
	}
	var got map[string]any
	if err := json.Unmarshal(stdout.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got["format"] != float64(1) || got["saved_at"] == nil {
		t.Fatalf("output %s", stdout.String())
	}
	for _, key := range []string{"players", "guilds", "bases"} {
		if items, ok := got[key].([]any); !ok || len(items) != 0 {
			t.Fatalf("%s in an empty world: %v", key, got[key])
		}
	}
}

func TestReadsACompressedSave(t *testing.T) {
	dir := t.TempDir()
	copyFixture(t, "Level.sav", filepath.Join(dir, "Level.sav"))
	var stdout, stderr bytes.Buffer
	if code := run([]string{"read", dir}, &stdout, &stderr); code != 0 || !strings.Contains(stdout.String(), "\"saved_at\"") {
		t.Fatalf("exit %d: %s %s", code, stderr.String(), stdout.String())
	}
	if code := run([]string{"read"}, &stdout, &stderr); code != 2 {
		t.Fatalf("usage exit %d", code)
	}
	if code := run([]string{"read", filepath.Join(dir, "missing")}, &stdout, &stderr); code != 1 {
		t.Fatalf("missing folder exit %d", code)
	}
}
