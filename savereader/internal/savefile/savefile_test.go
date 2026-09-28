package savefile

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func fixture(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "gvas", "testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func TestHeadersOfRealSaves(t *testing.T) {
	for name, raw := range map[string]int{"LevelMeta.sav": 2122, "Level.sav": 287568} {
		h, err := ReadHeader(fixture(t, name))
		if err != nil {
			t.Fatal(name, err)
		}
		if h.Magic != "PlM1" || h.RawSize != raw {
			t.Fatalf("%s: %+v", name, h)
		}
	}
}

func TestDecodeChecksTheSaveBeforeDecoding(t *testing.T) {
	data := fixture(t, "LevelMeta.sav")
	if _, err := Decode(data, nil); !errors.Is(err, ErrNoDecoder) {
		t.Fatalf("without a decoder: %v", err)
	}
	if _, err := Decode(data[:len(data)-10], nil); err == nil || !strings.Contains(err.Error(), "being written") {
		t.Fatalf("a short save: %v", err)
	}
	raw := fixture(t, "LevelMeta.gvas")
	decoded, err := Decode(data, func(compressed []byte, rawSize int) ([]byte, error) {
		if len(compressed) != len(data)-12 || rawSize != len(raw) {
			t.Fatalf("decoder got %d bytes for %d", len(compressed), rawSize)
		}
		return raw, nil
	})
	if err != nil || len(decoded) != len(raw) {
		t.Fatalf("decoded %d bytes: %v", len(decoded), err)
	}
	if _, err := Decode(data, func([]byte, int) ([]byte, error) { return raw[:10], nil }); err == nil {
		t.Fatal("a wrong size is an error")
	}
	if same, err := Decode(raw, nil); err != nil || len(same) != len(raw) {
		t.Fatalf("an already decompressed save passes through: %v", err)
	}
	if _, err := Decode([]byte("PlZ2\x00\x00\x00\x00\x00\x00\x00\x00"), nil); err == nil {
		t.Fatal("an unknown format is an error")
	}
}
