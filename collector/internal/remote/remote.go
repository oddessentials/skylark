package remote

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const (
	levelFile  = "Level.sav"
	playersDir = "Players"
)

var layouts = []string{"", "0", "SaveGames/0", "Saved/SaveGames/0", "Pal/Saved/SaveGames/0"}

var (
	ErrChanging = errors.New("the save changed while it was copied")
	ErrNoWorld  = errors.New("no Level.sav under the remote folder")
)

type Options struct {
	URL         string
	Password    string
	KeyFile     string
	HostKey     string
	HostKeyFile string
	Timeout     time.Duration
}

type Entry struct {
	Name     string
	Size     int64
	Modified time.Time
	Dir      bool
}

type session interface {
	List(ctx context.Context, dir string) ([]Entry, error)
	Fetch(ctx context.Context, file string, w io.Writer) error
	Close() error
}

type Snapshot struct {
	Dir      string
	World    string
	Modified time.Time
	Size     int64
	Players  int
}

type Fetcher struct {
	options Options
	target  *url.URL
	mirror  string
	world   string
	copies  map[string]Entry
	notice  func(string)
	open    func(context.Context) (session, error)
}

func Parse(raw string) (*url.URL, error) {
	target, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return nil, fmt.Errorf("saves.remote: %w", err)
	}
	switch target.Scheme {
	case "ftp", "ftps", "sftp":
	default:
		return nil, fmt.Errorf("saves.remote %s must start with ftp://, ftps:// or sftp://", Redact(raw))
	}
	if target.Hostname() == "" {
		return nil, fmt.Errorf("saves.remote %s has no host", Redact(raw))
	}
	return target, nil
}

func Redact(raw string) string {
	target, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || target.User == nil {
		return raw
	}
	if _, set := target.User.Password(); set {
		target.User = url.UserPassword(target.User.Username(), "xxxxx")
	}
	return target.String()
}

func New(options Options, mirror string, notice func(string)) (*Fetcher, error) {
	target, err := Parse(options.URL)
	if err != nil {
		return nil, err
	}
	if options.Timeout <= 0 {
		options.Timeout = 30 * time.Second
	}
	if notice == nil {
		notice = func(string) {}
	}
	fetcher := &Fetcher{options: options, target: target, mirror: mirror, copies: map[string]Entry{}, notice: notice}
	fetcher.open = fetcher.dial
	return fetcher, nil
}

func (f *Fetcher) Where() string {
	return Redact(f.options.URL)
}

func (f *Fetcher) password() string {
	if f.options.Password != "" {
		return f.options.Password
	}
	if f.target.User != nil {
		password, _ := f.target.User.Password()
		return password
	}
	return ""
}

func (f *Fetcher) user() string {
	if f.target.User != nil && f.target.User.Username() != "" {
		return f.target.User.Username()
	}
	if f.target.Scheme == "sftp" {
		return ""
	}
	return "anonymous"
}

func (f *Fetcher) root() string {
	root := f.target.Path
	if f.target.Scheme != "sftp" {
		if strings.HasPrefix(root, "//") {
			return root[1:]
		}
		root = strings.TrimPrefix(root, "/")
	}
	if root == "/~" || strings.HasPrefix(root, "/~/") {
		root = strings.TrimPrefix(strings.TrimPrefix(root, "/~"), "/")
	}
	if root == "" {
		return "."
	}
	return root
}

func (f *Fetcher) dial(ctx context.Context) (session, error) {
	if f.target.Scheme == "sftp" {
		opened, err := dialSFTP(ctx, f.target, f.user(), f.password(), f.options, f.notice)
		if err != nil {
			return nil, err
		}
		return opened, nil
	}
	opened, err := dialFTP(ctx, f.target, f.user(), f.password(), f.target.Scheme == "ftps", f.options.Timeout)
	if err != nil {
		return nil, err
	}
	return opened, nil
}

func level(entries []Entry) (Entry, bool) {
	for _, entry := range entries {
		if !entry.Dir && entry.Name == levelFile {
			return entry, true
		}
	}
	return Entry{}, false
}

func (f *Fetcher) newestWorld(ctx context.Context, s session, dir string, entries []Entry) (string, Entry, bool) {
	var best string
	var newest Entry
	for _, entry := range entries {
		if !entry.Dir || entry.Name == "." || entry.Name == ".." {
			continue
		}
		candidate := path.Join(dir, entry.Name)
		inside, err := s.List(ctx, candidate)
		if err != nil {
			continue
		}
		if found, ok := level(inside); ok && (best == "" || found.Modified.After(newest.Modified)) {
			best, newest = candidate, found
		}
	}
	return best, newest, best != ""
}

func (f *Fetcher) find(ctx context.Context, s session) (string, Entry, error) {
	if f.world != "" {
		if entries, err := s.List(ctx, f.world); err == nil {
			if found, ok := level(entries); ok {
				return f.world, found, nil
			}
		}
		f.world = ""
	}
	for index, layout := range layouts {
		dir := path.Join(f.root(), layout)
		entries, err := s.List(ctx, dir)
		if err != nil {
			if index == 0 {
				return "", Entry{}, fmt.Errorf("listing %s: %w", dir, err)
			}
			continue
		}
		if found, ok := level(entries); ok {
			f.world = dir
			return dir, found, nil
		}
		if world, found, ok := f.newestWorld(ctx, s, dir, entries); ok {
			f.world = world
			return world, found, nil
		}
	}
	return "", Entry{}, fmt.Errorf("%w %s", ErrNoWorld, f.root())
}

func (f *Fetcher) Probe(ctx context.Context) (Snapshot, error) {
	s, err := f.open(ctx)
	if err != nil {
		return Snapshot{}, err
	}
	defer s.Close()
	world, found, err := f.find(ctx, s)
	if err != nil {
		return Snapshot{}, err
	}
	players, _ := f.players(ctx, s, world)
	return Snapshot{World: world, Modified: found.Modified, Size: found.Size, Players: len(players)}, nil
}

func (f *Fetcher) players(ctx context.Context, s session, world string) ([]Entry, error) {
	entries, err := s.List(ctx, path.Join(world, playersDir))
	if err != nil {
		return nil, err
	}
	var saves []Entry
	for _, entry := range entries {
		if !entry.Dir && strings.EqualFold(path.Ext(entry.Name), ".sav") && !strings.ContainsAny(entry.Name, `/\`) {
			saves = append(saves, entry)
		}
	}
	sort.Slice(saves, func(i, j int) bool { return saves[i].Name < saves[j].Name })
	return saves, nil
}

func same(a, b Entry) bool {
	return a.Size == b.Size && a.Modified.Equal(b.Modified)
}

func (f *Fetcher) copy(ctx context.Context, s session, remoteFile, key string, entry Entry) error {
	local := filepath.Join(f.mirror, filepath.FromSlash(key))
	if previous, ok := f.copies[key]; ok && same(previous, entry) {
		if _, err := os.Stat(local); err == nil {
			return nil
		}
	}
	if err := os.MkdirAll(filepath.Dir(local), 0o755); err != nil {
		return err
	}
	temp, err := os.CreateTemp(filepath.Dir(local), ".download-*")
	if err != nil {
		return err
	}
	fetchErr := s.Fetch(ctx, remoteFile, temp)
	closeErr := temp.Close()
	if fetchErr == nil {
		fetchErr = closeErr
	}
	if fetchErr != nil {
		os.Remove(temp.Name())
		return fmt.Errorf("copying %s: %w", remoteFile, fetchErr)
	}
	if err := os.Rename(temp.Name(), local); err != nil {
		os.Remove(temp.Name())
		return err
	}
	f.copies[key] = entry
	return nil
}

func (f *Fetcher) Sync(ctx context.Context) (Snapshot, error) {
	s, err := f.open(ctx)
	if err != nil {
		return Snapshot{}, err
	}
	defer s.Close()
	world, found, err := f.find(ctx, s)
	if err != nil {
		return Snapshot{}, err
	}
	players, err := f.players(ctx, s, world)
	if err != nil {
		players = nil
	}
	if err := f.copy(ctx, s, path.Join(world, levelFile), levelFile, found); err != nil {
		return Snapshot{}, err
	}
	keep := map[string]bool{}
	for _, player := range players {
		key := playersDir + "/" + player.Name
		keep[key] = true
		if err := f.copy(ctx, s, path.Join(world, playersDir, player.Name), key, player); err != nil {
			return Snapshot{}, err
		}
	}
	if err := f.prune(keep); err != nil {
		return Snapshot{}, err
	}
	entries, err := s.List(ctx, world)
	if err != nil {
		return Snapshot{}, err
	}
	if after, ok := level(entries); !ok || !same(after, found) {
		delete(f.copies, levelFile)
		return Snapshot{}, ErrChanging
	}
	return Snapshot{Dir: f.mirror, World: world, Modified: found.Modified, Size: found.Size, Players: len(players)}, nil
}

func (f *Fetcher) prune(keep map[string]bool) error {
	dir := filepath.Join(f.mirror, playersDir)
	entries, err := os.ReadDir(dir)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	for _, entry := range entries {
		key := playersDir + "/" + entry.Name()
		if entry.IsDir() || keep[key] {
			continue
		}
		if err := os.Remove(filepath.Join(dir, entry.Name())); err != nil {
			return err
		}
		delete(f.copies, key)
	}
	return nil
}
