package ooz

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/oddessentials/skylark/savereader/internal/savefile"
)

func testdata(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "gvas", "testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func decoder(t *testing.T) *Decoder {
	t.Helper()
	d, err := New(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	return d
}

func TestTheEmbeddedDecoderIsTheOoZWasmBuild(t *testing.T) {
	wasm, err := Wasm()
	if err != nil {
		t.Fatal(err)
	}
	if len(wasm) != 92143 || string(wasm[:4]) != "\x00asm" {
		t.Fatalf("wasm of %d bytes starting %q", len(wasm), wasm[:4])
	}
}

func TestDecodesRealSaves(t *testing.T) {
	d := decoder(t)
	for _, name := range []string{"LevelMeta", "Level", "LevelMeta"} {
		raw, err := savefile.Decode(testdata(t, name+".sav"), d.Decode)
		if err != nil {
			t.Fatal(name, err)
		}
		if !bytes.Equal(raw, testdata(t, name+".gvas")) {
			t.Fatalf("%s decoded to %d bytes that differ from the reference", name, len(raw))
		}
	}
}

func TestDamagedSavesFailWithoutPanicking(t *testing.T) {
	d := decoder(t)
	save := testdata(t, "Level.sav")
	header, err := savefile.ReadHeader(save)
	if err != nil {
		t.Fatal(err)
	}
	payload := save[12:]
	damaged := append([]byte(nil), payload...)
	for i := len(damaged) / 3; i < len(damaged)/3+400; i++ {
		damaged[i] ^= 0x5a
	}
	cases := map[string][]byte{
		"damaged":   damaged,
		"truncated": payload[:len(payload)/2],
		"empty":     {},
	}
	for name, input := range cases {
		out, err := d.Decode(input, header.RawSize)
		if err == nil && bytes.Equal(out, testdata(t, "Level.gvas")) {
			t.Fatalf("%s input decoded to the real world", name)
		}
	}
	if _, err := d.Decode(payload, MaxRawSize+1); err == nil {
		t.Fatal("an oversized save was accepted")
	}
	raw, err := d.Decode(payload, header.RawSize)
	if err != nil || !bytes.Equal(raw, testdata(t, "Level.gvas")) {
		t.Fatalf("the decoder did not recover after bad input: %v", err)
	}
}
