package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/oddessentials/skylark/savereader/internal/ooz"
	"github.com/oddessentials/skylark/savereader/internal/palworld"
)

const format = 1

var version = "dev"

const usage = `skylark-savereader %s

Usage:
  skylark-savereader read <world save folder>
  skylark-savereader version

Reads Level.sav and Players/*.sav from a Palworld world save folder (SaveGames/0/<world id>) and prints
players, guilds and bases as JSON for the Skylark collector. It only reads; it never changes a save.
`

type output struct {
	Format int `json:"format"`
	*palworld.World
}

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

func run(args []string, stdout, stderr io.Writer) int {
	if len(args) == 1 && args[0] == "version" {
		fmt.Fprintln(stdout, version)
		return 0
	}
	if len(args) != 2 || args[0] != "read" {
		fmt.Fprintf(stderr, usage, version)
		return 2
	}
	decoder, err := ooz.New(context.Background())
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	defer decoder.Close()
	world, err := palworld.ReadDir(args[1], decoder.Decode)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	encoder := json.NewEncoder(stdout)
	if err := encoder.Encode(output{Format: format, World: world}); err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	return 0
}
