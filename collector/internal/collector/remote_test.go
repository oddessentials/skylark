package collector

import (
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/oddessentials/skylark/collector/internal/config"
	"github.com/oddessentials/skylark/collector/internal/ingest"
	"github.com/oddessentials/skylark/collector/internal/remote/remotetest"
)

func TestCollectorReadsARemoteSaveWithoutREST(t *testing.T) {
	site := &fakeSite{secret: "site-secret", actions: []ingest.Action{{ID: 41, Kind: ingest.ActionSave}}}
	ingestServer := httptest.NewServer(site)
	defer ingestServer.Close()
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("SKYLARK_FAKE_SAVEREADER", "world")
	root := t.TempDir()
	world := filepath.Join(root, "Pal", "Saved", "SaveGames", "0", "D09CACDB477D6CE562170AA79C524138")
	if err := os.MkdirAll(filepath.Join(world, "Players"), 0o755); err != nil {
		t.Fatal(err)
	}
	for _, file := range []string{"Level.sav", filepath.Join("Players", "5E7A11C0000000000000000000000000.sav")} {
		if err := os.WriteFile(filepath.Join(world, file), []byte("PlM1"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	address := remotetest.StartSFTP(t, root, "palworld", "sftp-secret", remotetest.HostKey(t))
	cfg := testConfig(t, "", ingestServer.URL, config.SourceNone)
	cfg.Palworld.RestOff = true
	cfg.Saves.Reader = executable
	cfg.Saves.Interval = time.Minute
	cfg.Saves.Remote = "sftp://palworld@" + address + "/~/"
	cfg.Saves.Password = "sftp-secret"
	cancel, done := start(t, cfg, nil)
	for _, eventType := range []string{"save.player", "save.guild", "save.base", "save.read"} {
		eventually(t, eventType, func() bool { return site.has(eventType, nil) })
	}
	if !site.has("collector.started", func(data string) bool {
		return strings.Contains(data, `"rest":false`) && strings.Contains(data, `"saves":true`)
	}) {
		t.Fatal("collector.started reports REST off and saves on")
	}
	eventually(t, "the save action refused", func() bool {
		return site.has("action.failed", func(data string) bool { return strings.Contains(data, "palworld.rest_url is off") })
	})
	eventually(t, "a heartbeat with REST off", func() bool {
		return site.has("collector.heartbeat", func(data string) bool {
			return strings.Contains(data, `"rest":"off"`) && strings.Contains(data, `"gamedata":"off"`) && strings.Contains(data, `"saves":"ok"`)
		})
	})
	stop(t, cancel, done)
	validateAll(t, site)
	if site.has("server.offline", nil) || site.has("server.online", nil) {
		t.Fatal("without REST the collector says nothing about the server being up or down")
	}
	if _, err := os.Stat(filepath.Join(cfg.JournalDir, "saves-mirror", "Players", "5E7A11C0000000000000000000000000.sav")); err != nil {
		t.Fatalf("the save is mirrored in the journal folder: %v", err)
	}
	if pinned, err := os.ReadFile(filepath.Join(cfg.JournalDir, "saves-host-key")); err != nil || !strings.HasPrefix(string(pinned), "SHA256:") {
		t.Fatalf("the host key is pinned: %q %v", pinned, err)
	}
}
