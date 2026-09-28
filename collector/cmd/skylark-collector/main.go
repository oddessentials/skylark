package main

import (
	"fmt"
	"os"

	"github.com/oddessentials/skylark/collector/internal/buildinfo"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "version" {
		fmt.Println(buildinfo.Version)
		return
	}
	fmt.Fprintf(os.Stderr, "skylark-collector %s\n", buildinfo.Version)
	os.Exit(2)
}
