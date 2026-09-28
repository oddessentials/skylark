package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const settingsLine = `OptionSettings=(Difficulty=None,RandomizerType=None,RandomizerSeed="",DayTimeSpeedRate=1.000000,ServerName="Test, with a comma",ServerDescription="",AdminPassword="ini-secret",ServerPassword="",PublicPort=8211,RCONEnabled=False,RCONPort=25575,Region="",bUseAuth=True,BanListURL="https://b.palworldgame.com/api/banlist.txt",RESTAPIEnabled=True,RESTAPIPort=8313,bShowPlayerList=False,ChatPostLimitPerMinute=30,CrossplayPlatforms=(Steam,Xbox,PS5,Mac),bIsUseBackupSaveData=True,LogFormatType=Text,bIsShowJoinLeftMessage=True,DenyTechnologyList=,bAllowEnemyCampSpawnNearBaseCamp=False)`

func env(values map[string]string) func(string) string {
	return func(name string) string { return values[name] }
}

func writeIni(t *testing.T, dir, platform string) string {
	t.Helper()
	path := filepath.Join(dir, "Pal", "Saved", "Config", platform, "PalWorldSettings.ini")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	content := "[/Script/Pal.PalGameWorldSettings]\r\n" + settingsLine + "\r\n"
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestParseOptionSettings(t *testing.T) {
	values, err := ParseOptionSettings(strings.TrimPrefix(settingsLine, "OptionSettings="))
	if err != nil {
		t.Fatal(err)
	}
	checks := map[string]string{
		"ServerName":         "Test, with a comma",
		"AdminPassword":      "ini-secret",
		"RESTAPIPort":        "8313",
		"CrossplayPlatforms": "(Steam,Xbox,PS5,Mac)",
		"DenyTechnologyList": "",
		"LogFormatType":      "Text",
	}
	for key, want := range checks {
		if got := values[key]; got != want {
			t.Errorf("%s: got %q want %q", key, got, want)
		}
	}
}

func TestLoadFileEnvAndServerIni(t *testing.T) {
	dir := t.TempDir()
	serverDir := filepath.Join(dir, "server")
	writeIni(t, serverDir, "LinuxServer")
	configPath := filepath.Join(dir, "skylark-collector.toml")
	content := strings.Join([]string{
		`send_ips = true`,
		`[site]`,
		`url = "https://skylark.example"`,
		`secret = "file-secret"`,
		`[palworld]`,
		`server_dir = '` + serverDir + `'`,
		`[logs]`,
		`source = "docker"`,
		`[docker]`,
		`container = "palworld"`,
		`[intervals]`,
		`players = "3s"`,
		`snapshot = "8s"`,
	}, "\n")
	if err := os.WriteFile(configPath, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	cfg, err := Load(Options{Path: configPath, Platform: "linux", Getenv: env(map[string]string{
		"SKYLARK_SITE_SECRET":        "env-secret",
		"SKYLARK_INTERVALS_METRICS":  "45s",
		"SKYLARK_INTERVALS_SNAPSHOT": "9s",
	})})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Site.Secret != "env-secret" || cfg.IngestURL() != "https://skylark.example/api/ingest" {
		t.Fatalf("site %+v", cfg.Site)
	}
	if cfg.Palworld.AdminPassword != "ini-secret" || cfg.Palworld.RestURL != "http://127.0.0.1:8313" {
		t.Fatalf("palworld %+v", cfg.Palworld)
	}
	if cfg.Intervals.Players != 3*time.Second || cfg.Intervals.Snapshot != 9*time.Second || cfg.Intervals.Metrics != 45*time.Second || cfg.Intervals.Heartbeat != time.Minute || cfg.Intervals.Flush != 2*time.Second || cfg.Intervals.Actions != 5*time.Second {
		t.Fatalf("intervals %+v", cfg.Intervals)
	}
	if cfg.Logs.Timezone != "UTC" || cfg.Location != time.UTC || !cfg.SendIPs {
		t.Fatalf("logs %+v send_ips %v", cfg.Logs, cfg.SendIPs)
	}
	if len(cfg.Warnings) != 1 || !strings.Contains(cfg.Warnings[0], "LogFormatType=Text") {
		t.Fatalf("warnings %v", cfg.Warnings)
	}
	if cfg.JournalDir != filepath.Join(dir, "skylark-journal") {
		t.Fatalf("journal %s", cfg.JournalDir)
	}
}

func TestLaunchModeReadsTheUserDirAndArguments(t *testing.T) {
	dir := t.TempDir()
	userDir := filepath.Join(dir, "world")
	path := filepath.Join(userDir, "Saved", "Config", "WindowsServer", "PalWorldSettings.ini")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	os.WriteFile(path, []byte(strings.Replace(settingsLine, "RESTAPIEnabled=True", "RESTAPIEnabled=False", 1)+"\n"), 0o644)
	cfg, err := Load(Options{Platform: "windows", ExeDir: dir, Getenv: env(map[string]string{
		"SKYLARK_SITE_URL":       "http://localhost:5173",
		"SKYLARK_SITE_SECRET":    "s",
		"SKYLARK_LAUNCH_COMMAND": `D:\server\PalServer.exe`,
		"SKYLARK_LAUNCH_ARGS":    `-port=18211 "-UserDir=` + userDir + `" -restapi -restapiport=18212 -adminpassword=arg-secret`,
	})})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Logs.Source != SourceLaunch || cfg.Logs.Timezone != "Local" {
		t.Fatalf("logs %+v", cfg.Logs)
	}
	if cfg.ServerIni == nil || cfg.ServerIni.Path != path {
		t.Fatalf("ini %+v", cfg.ServerIni)
	}
	if cfg.Palworld.AdminPassword != "arg-secret" || cfg.Palworld.RestURL != "http://127.0.0.1:18212" {
		t.Fatalf("palworld %+v", cfg.Palworld)
	}
	if len(cfg.Warnings) != 0 {
		t.Fatalf("-restapi overrides RESTAPIEnabled=False, so no warning: %v", cfg.Warnings)
	}
	if cfg.Launch.ShutdownWait != 5*time.Second || !*cfg.Launch.EnableGameData {
		t.Fatalf("launch %+v", cfg.Launch)
	}
}

func TestValidationErrors(t *testing.T) {
	_, err := Load(Options{Getenv: env(map[string]string{"SKYLARK_LOGS_SOURCE": "syslog", "SKYLARK_INTERVALS_PLAYERS": "500ms", "SKYLARK_INTERVALS_ACTIONS": "200ms"})})
	if err == nil {
		t.Fatal("expected errors")
	}
	for _, part := range []string{"site.url is required", "site.secret is required", "admin_password is required", `logs.source "syslog"`, "intervals.players must be at least 1s", "intervals.actions must be at least 1s"} {
		if !strings.Contains(err.Error(), part) {
			t.Errorf("missing %q in %v", part, err)
		}
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "c.toml")
	os.WriteFile(path, []byte("[site]\nurl = \"https://x.example\"\nsecrt = \"typo\"\n"), 0o644)
	if _, err := Load(Options{Path: path, Getenv: env(nil)}); err == nil || !strings.Contains(err.Error(), "site.secrt") {
		t.Fatalf("unknown keys are reported: %v", err)
	}
	if _, err := Load(Options{Path: filepath.Join(dir, "missing.toml"), Getenv: env(nil)}); err == nil {
		t.Fatal("an explicit missing file is an error")
	}
	cfg, err := Load(Options{DryRun: true, Getenv: env(map[string]string{"SKYLARK_PALWORLD_ADMIN_PASSWORD": "p", "SKYLARK_INTERVALS_SNAPSHOT": "20s"})})
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.Warnings) != 1 || !strings.Contains(cfg.Warnings[0], "deaths may be missed") {
		t.Fatalf("warnings %v", cfg.Warnings)
	}
}

func TestSplitArgs(t *testing.T) {
	args, err := SplitArgs(`-port=8211 "-UserDir=C:\Pal Worlds\one" -useperfthreads`)
	if err != nil || strings.Join(args, "|") != `-port=8211|-UserDir=C:\Pal Worlds\one|-useperfthreads` {
		t.Fatalf("args %q %v", args, err)
	}
	args, err = SplitArgs(`["-port=8211", "-publiclobby"]`)
	if err != nil || len(args) != 2 {
		t.Fatalf("args %q %v", args, err)
	}
	if _, err := SplitArgs(`"unterminated`); err == nil {
		t.Fatal("expected an error")
	}
}

func TestWindowsFileAndStdinSourcesWarnAboutBufferedOutput(t *testing.T) {
	base := map[string]string{"SKYLARK_SITE_URL": "http://localhost:5173", "SKYLARK_SITE_SECRET": "s", "SKYLARK_PALWORLD_ADMIN_PASSWORD": "p"}
	for _, source := range []string{SourceFile, SourceStdin} {
		values := map[string]string{"SKYLARK_LOGS_SOURCE": source, "SKYLARK_FILE_PATH": `D:\server\console.log`}
		for key, value := range base {
			values[key] = value
		}
		for platform, want := range map[string]bool{"windows": true, "linux": false} {
			cfg, err := Load(Options{Platform: platform, Getenv: env(values)})
			if err != nil {
				t.Fatal(err)
			}
			warned := false
			for _, warning := range cfg.Warnings {
				if strings.Contains(warning, "pseudo console") && strings.Contains(warning, "logs.source is "+source) {
					warned = true
				}
			}
			if warned != want {
				t.Fatalf("%s on %s: warnings %v", source, platform, cfg.Warnings)
			}
		}
	}
}
