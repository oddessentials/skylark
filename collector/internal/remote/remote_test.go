package remote

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/oddessentials/skylark/collector/internal/remote/remotetest"
)

const (
	testUser     = "palworld"
	testPassword = "not-the-admin-password"
	worldID      = "D09CACDB477D6CE562170AA79C524138"
)

var saved = time.Date(2026, 9, 28, 15, 30, 0, 0, time.UTC)

func write(t *testing.T, file, text string, at time.Time) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(file, at, at); err != nil {
		t.Fatal(err)
	}
}

func serverTree(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	world := filepath.Join(root, "Pal", "Saved", "SaveGames", "0", worldID)
	write(t, filepath.Join(world, "Level.sav"), "level one", saved)
	write(t, filepath.Join(world, "Players", "5E7A11C0000000000000000000000000.sav"), "wanderer", saved)
	write(t, filepath.Join(world, "Players", "7A3B22D1000000000000000000000000.sav"), "rook", saved)
	write(t, filepath.Join(world, "LevelMeta.sav"), "meta", saved)
	old := filepath.Join(root, "Pal", "Saved", "SaveGames", "0", "0FF0000000000000000000000000000A")
	write(t, filepath.Join(old, "Level.sav"), "an older world", saved.Add(-48*time.Hour))
	return root
}

func read(t *testing.T, file string) string {
	t.Helper()
	data, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

func fetcher(t *testing.T, target string, options Options) (*Fetcher, string, *[]string) {
	t.Helper()
	mirror := filepath.Join(t.TempDir(), "saves-mirror")
	options.URL = target
	if options.Timeout == 0 {
		options.Timeout = 10 * time.Second
	}
	var notices []string
	f, err := New(options, mirror, func(text string) { notices = append(notices, text) })
	if err != nil {
		t.Fatal(err)
	}
	return f, mirror, &notices
}

func TestSFTPMirrorsTheNewestWorldAndOnlyWhatChanged(t *testing.T) {
	root := serverTree(t)
	address := remotetest.StartSFTP(t, root, testUser, testPassword, remotetest.HostKey(t))
	keyFile := filepath.Join(t.TempDir(), "saves-host-key")
	f, mirror, notices := fetcher(t, "sftp://"+testUser+"@"+address+"/~/Pal/Saved", Options{Password: testPassword, HostKeyFile: keyFile})
	ctx := context.Background()
	snapshot, err := f.Sync(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.World != "Pal/Saved/SaveGames/0/"+worldID || snapshot.Players != 2 || !snapshot.Modified.Equal(saved) {
		t.Fatalf("snapshot %+v", snapshot)
	}
	if read(t, filepath.Join(mirror, "Level.sav")) != "level one" || read(t, filepath.Join(mirror, "Players", "7A3B22D1000000000000000000000000.sav")) != "rook" {
		t.Fatal("the mirror holds the world save")
	}
	if _, err := os.Stat(filepath.Join(mirror, "LevelMeta.sav")); err == nil {
		t.Fatal("only Level.sav and the players are copied")
	}
	if len(*notices) != 1 || !strings.Contains((*notices)[0], "SHA256:") {
		t.Fatalf("the first connection pins the host key: %v", *notices)
	}
	mirrored := filepath.Join(mirror, "Players", "5E7A11C0000000000000000000000000.sav")
	if err := os.Chtimes(mirrored, saved.Add(-time.Hour), saved.Add(-time.Hour)); err != nil {
		t.Fatal(err)
	}
	world := filepath.Join(root, "Pal", "Saved", "SaveGames", "0", worldID)
	write(t, filepath.Join(world, "Level.sav"), "level two!", saved.Add(time.Minute))
	write(t, filepath.Join(world, "Players", "7A3B22D1000000000000000000000000.sav"), "rook, later", saved.Add(time.Minute))
	if err := os.Remove(filepath.Join(world, "Players", "5E7A11C0000000000000000000000000.sav")); err != nil {
		t.Fatal(err)
	}
	snapshot, err = f.Sync(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if !snapshot.Modified.Equal(saved.Add(time.Minute)) || snapshot.Players != 1 {
		t.Fatalf("second snapshot %+v", snapshot)
	}
	if read(t, filepath.Join(mirror, "Level.sav")) != "level two!" || read(t, filepath.Join(mirror, "Players", "7A3B22D1000000000000000000000000.sav")) != "rook, later" {
		t.Fatal("changed files are copied again")
	}
	if _, err := os.Stat(mirrored); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("a player file gone from the server is removed from the mirror")
	}
	probe, err := f.Probe(ctx)
	if err != nil || probe.Players != 1 || probe.Size != int64(len("level two!")) {
		t.Fatalf("probe %+v %v", probe, err)
	}
}

func TestSFTPRefusesAChangedOrUnpinnedHostKey(t *testing.T) {
	root := serverTree(t)
	first := remotetest.StartSFTP(t, root, testUser, testPassword, remotetest.HostKey(t))
	keyFile := filepath.Join(t.TempDir(), "saves-host-key")
	f, _, _ := fetcher(t, "sftp://"+testUser+"@"+first, Options{Password: testPassword, HostKeyFile: keyFile})
	if _, err := f.Probe(context.Background()); err != nil {
		t.Fatal(err)
	}
	pinned := strings.TrimSpace(read(t, keyFile))
	second := remotetest.StartSFTP(t, root, testUser, testPassword, remotetest.HostKey(t))
	g, _, _ := fetcher(t, "sftp://"+testUser+"@"+second, Options{Password: testPassword, HostKeyFile: keyFile})
	if _, err := g.Probe(context.Background()); err == nil || !strings.Contains(err.Error(), "changed from "+pinned) {
		t.Fatalf("a different host key is refused, got %v", err)
	}
	h, _, _ := fetcher(t, "sftp://"+testUser+"@"+first, Options{Password: testPassword, HostKey: "SHA256:not-this-one"})
	if _, err := h.Probe(context.Background()); err == nil || !strings.Contains(err.Error(), "saves.host_key") {
		t.Fatalf("a pinned key that does not match is refused, got %v", err)
	}
	wrong, _, _ := fetcher(t, "sftp://"+testUser+"@"+first, Options{Password: "guess", HostKey: pinned})
	if _, err := wrong.Probe(context.Background()); err == nil {
		t.Fatal("a wrong password fails")
	}
}

type ftpServer struct {
	root     string
	listener net.Listener
	mu       sync.Mutex
	commands []string
}

func startFTP(t *testing.T, root string) *ftpServer {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	server := &ftpServer{root: root, listener: listener}
	t.Cleanup(func() { listener.Close() })
	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				return
			}
			go server.serve(conn)
		}
	}()
	return server
}

func (s *ftpServer) local(name string) string {
	clean := path.Clean("/" + strings.TrimSpace(name))
	return filepath.Join(s.root, filepath.FromSlash(clean))
}

func (s *ftpServer) serve(conn net.Conn) {
	defer conn.Close()
	reader := bufio.NewReader(conn)
	reply := func(format string, args ...any) { fmt.Fprintf(conn, format+"\r\n", args...) }
	reply("220 test server ready")
	var data net.Listener
	loggedIn := false
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			return
		}
		line = strings.TrimRight(line, "\r\n")
		command, argument, _ := strings.Cut(line, " ")
		command = strings.ToUpper(command)
		s.mu.Lock()
		s.commands = append(s.commands, command)
		s.mu.Unlock()
		switch command {
		case "USER":
			reply("331 password please")
		case "PASS":
			if argument != testPassword {
				reply("530 wrong password")
				continue
			}
			loggedIn = true
			reply("230 logged in")
		case "FEAT":
			reply("211-Features:\r\n MLST type*;size*;modify*;\r\n MDTM\r\n UTF8\r\n211 End")
		case "TYPE", "OPTS":
			reply("200 ok")
		case "EPSV":
			data, err = net.Listen("tcp", "127.0.0.1:0")
			if err != nil {
				reply("425 no data connection")
				continue
			}
			reply("229 Entering Extended Passive Mode (|||%d|)", data.Addr().(*net.TCPAddr).Port)
		case "MDTM":
			info, err := os.Stat(s.local(argument))
			if err != nil || !loggedIn {
				reply("550 no such file")
				continue
			}
			reply("213 %s", info.ModTime().UTC().Format("20060102150405"))
		case "MLSD", "RETR":
			if data == nil || !loggedIn {
				reply("425 use EPSV first")
				continue
			}
			transfer, err := data.Accept()
			data.Close()
			data = nil
			if err != nil {
				reply("425 no data connection")
				continue
			}
			if command == "MLSD" {
				entries, err := os.ReadDir(s.local(argument))
				if err != nil {
					transfer.Close()
					reply("550 no such folder")
					continue
				}
				reply("150 listing")
				for _, entry := range entries {
					info, _ := entry.Info()
					kind := "file"
					if entry.IsDir() {
						kind = "dir"
					}
					fmt.Fprintf(transfer, "type=%s;size=%d;modify=%s; %s\r\n", kind, info.Size(), info.ModTime().UTC().Format("20060102150405"), entry.Name())
				}
			} else {
				file, err := os.Open(s.local(argument))
				if err != nil {
					transfer.Close()
					reply("550 no such file")
					continue
				}
				reply("150 sending")
				io.Copy(transfer, file)
				file.Close()
			}
			transfer.Close()
			reply("226 done")
		case "QUIT":
			reply("221 bye")
			return
		default:
			reply("502 not implemented")
		}
	}
}

func TestFTPMirrorsTheWorldSave(t *testing.T) {
	root := serverTree(t)
	server := startFTP(t, root)
	f, mirror, _ := fetcher(t, "ftp://"+testUser+"@"+server.listener.Addr().String()+"/Pal/Saved/SaveGames/0", Options{Password: testPassword})
	snapshot, err := f.Sync(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.World != "Pal/Saved/SaveGames/0/"+worldID || snapshot.Players != 2 || !snapshot.Modified.Equal(saved) {
		t.Fatalf("snapshot %+v", snapshot)
	}
	if read(t, filepath.Join(mirror, "Players", "5E7A11C0000000000000000000000000.sav")) != "wanderer" {
		t.Fatal("the player files are copied")
	}
	server.mu.Lock()
	server.commands = nil
	server.mu.Unlock()
	if _, err := f.Sync(context.Background()); err != nil {
		t.Fatal(err)
	}
	server.mu.Lock()
	commands := append([]string(nil), server.commands...)
	server.mu.Unlock()
	for _, command := range commands {
		if command == "RETR" {
			t.Fatal("an unchanged save is not downloaded again")
		}
	}
	wrong, _, _ := fetcher(t, "ftp://"+testUser+":guess@"+server.listener.Addr().String()+"/", Options{})
	if _, err := wrong.Probe(context.Background()); err == nil {
		t.Fatal("a wrong password fails")
	}
}

type changingSession struct {
	lists int
}

func (s *changingSession) List(_ context.Context, dir string) ([]Entry, error) {
	switch path.Base(dir) {
	case "Players":
		return nil, nil
	case "world":
		s.lists++
		return []Entry{{Name: "Level.sav", Size: int64(s.lists), Modified: saved.Add(time.Duration(s.lists) * time.Second)}}, nil
	}
	return []Entry{{Name: "world", Dir: true}}, nil
}

func (s *changingSession) Fetch(_ context.Context, _ string, w io.Writer) error {
	_, err := io.WriteString(w, "half a save")
	return err
}

func (s *changingSession) Close() error { return nil }

func TestASaveThatChangesWhileItIsCopiedIsNotRead(t *testing.T) {
	f, _, _ := fetcher(t, "ftp://example.invalid/", Options{})
	fake := &changingSession{}
	f.open = func(context.Context) (session, error) { return fake, nil }
	if _, err := f.Sync(context.Background()); !errors.Is(err, ErrChanging) {
		t.Fatalf("expected ErrChanging, got %v", err)
	}
}

func TestPathsFollowEachProtocol(t *testing.T) {
	cases := map[string]string{
		"ftp://host/Pal/Saved":    "Pal/Saved",
		"ftp://host/%2FPal/Saved": "/Pal/Saved",
		"ftps://host":             ".",
		"sftp://u@host/srv/Saved": "/srv/Saved",
		"sftp://u@host/~/Saved":   "Saved",
		"sftp://u@host/~":         ".",
		"sftp://u@host":           ".",
	}
	for raw, want := range cases {
		f, err := New(Options{URL: raw}, t.TempDir(), nil)
		if err != nil {
			t.Fatal(err)
		}
		if got := f.root(); got != want {
			t.Errorf("%s: root %q, want %q", raw, got, want)
		}
	}
}

func TestParseAndRedact(t *testing.T) {
	for _, bad := range []string{"http://host/", "ftp:///path", "C:/saves"} {
		if _, err := Parse(bad); err == nil {
			t.Errorf("%s should be refused", bad)
		}
	}
	if got := Redact("sftp://palworld:hunter2@host:2022/Pal/Saved"); strings.Contains(got, "hunter2") || !strings.Contains(got, "palworld") {
		t.Fatalf("redacted %s", got)
	}
	if _, err := New(Options{URL: "ftps://host/"}, t.TempDir(), nil); err != nil {
		t.Fatal(err)
	}
}
