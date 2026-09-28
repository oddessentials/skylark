package serverlog

import (
	"bufio"
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"
)

var dialNamedPipe func(ctx context.Context, path string) (net.Conn, error)

type DockerSource struct {
	Host       string
	Container  string
	CursorPath string
	Backfill   time.Duration
}

func (s *DockerSource) Name() string {
	return "docker"
}

func DefaultDockerHost() string {
	if runtime.GOOS == "windows" {
		return "npipe:////./pipe/docker_engine"
	}
	return "unix:///var/run/docker.sock"
}

type dockerClient struct {
	base string
	http *http.Client
}

func newDockerClient(host string) (*dockerClient, error) {
	if host == "" {
		host = DefaultDockerHost()
	}
	parsed, err := url.Parse(host)
	if err != nil {
		return nil, fmt.Errorf("docker host %q: %w", host, err)
	}
	transport := &http.Transport{Proxy: nil, DisableCompression: true}
	base := "http://docker"
	switch parsed.Scheme {
	case "unix":
		path := parsed.Path
		if path == "" {
			path = parsed.Opaque
		}
		transport.DialContext = func(ctx context.Context, _, _ string) (net.Conn, error) {
			var dialer net.Dialer
			return dialer.DialContext(ctx, "unix", path)
		}
	case "npipe":
		if dialNamedPipe == nil {
			return nil, errors.New("named pipes are only available on Windows")
		}
		path := PipePath(parsed.Path)
		transport.DialContext = func(ctx context.Context, _, _ string) (net.Conn, error) {
			return dialNamedPipe(ctx, path)
		}
	case "tcp", "http":
		base = "http://" + parsed.Host
	case "https":
		base = "https://" + parsed.Host
	default:
		return nil, fmt.Errorf("docker host %q: unsupported scheme %q", host, parsed.Scheme)
	}
	return &dockerClient{base: base, http: &http.Client{Transport: transport}}, nil
}

type containerState struct {
	Running   bool
	StartedAt time.Time
	TTY       bool
}

func (c *dockerClient) inspect(ctx context.Context, name string) (containerState, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.base+"/containers/"+url.PathEscape(name)+"/json", nil)
	if err != nil {
		return containerState{}, err
	}
	requestCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	response, err := c.http.Do(request.WithContext(requestCtx))
	if err != nil {
		return containerState{}, err
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusNotFound {
		return containerState{}, fmt.Errorf("container %q not found", name)
	}
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		return containerState{}, fmt.Errorf("docker inspect %s: HTTP %d: %s", name, response.StatusCode, strings.TrimSpace(string(body)))
	}
	var payload struct {
		State struct {
			Running   bool   `json:"Running"`
			StartedAt string `json:"StartedAt"`
		} `json:"State"`
		Config struct {
			Tty bool `json:"Tty"`
		} `json:"Config"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return containerState{}, err
	}
	started, _ := time.Parse(time.RFC3339Nano, payload.State.StartedAt)
	return containerState{Running: payload.State.Running, StartedAt: started, TTY: payload.Config.Tty}, nil
}

func (c *dockerClient) logs(ctx context.Context, name string, since time.Time) (*http.Response, error) {
	query := url.Values{}
	query.Set("follow", "true")
	query.Set("stdout", "true")
	query.Set("stderr", "true")
	query.Set("timestamps", "true")
	if !since.IsZero() {
		query.Set("since", strconv.FormatInt(since.Unix(), 10)+"."+fmt.Sprintf("%09d", since.Nanosecond()))
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.base+"/containers/"+url.PathEscape(name)+"/logs?"+query.Encode(), nil)
	if err != nil {
		return nil, err
	}
	response, err := c.http.Do(request)
	if err != nil {
		return nil, err
	}
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		response.Body.Close()
		return nil, fmt.Errorf("docker logs %s: HTTP %d: %s", name, response.StatusCode, strings.TrimSpace(string(body)))
	}
	return response, nil
}

func InspectContainer(ctx context.Context, host, name string) (bool, error) {
	client, err := newDockerClient(host)
	if err != nil {
		return false, err
	}
	state, err := client.inspect(ctx, name)
	if err != nil {
		return false, err
	}
	return state.Running, nil
}

func (s *DockerSource) loadCursor() time.Time {
	if s.CursorPath == "" {
		return time.Time{}
	}
	data, err := os.ReadFile(s.CursorPath)
	if err != nil {
		return time.Time{}
	}
	var cursor struct {
		Container string `json:"container"`
		Time      string `json:"time"`
	}
	if json.Unmarshal(data, &cursor) != nil || cursor.Container != s.Container {
		return time.Time{}
	}
	parsed, err := time.Parse(time.RFC3339Nano, cursor.Time)
	if err != nil {
		return time.Time{}
	}
	return parsed
}

func (s *DockerSource) saveCursor(at time.Time) {
	if s.CursorPath == "" || at.IsZero() {
		return
	}
	data, err := json.Marshal(map[string]string{"container": s.Container, "time": at.UTC().Format(time.RFC3339Nano)})
	if err != nil {
		return
	}
	writeFileAtomic(s.CursorPath, data)
}

func (s *DockerSource) Run(ctx context.Context, sink Sink) error {
	client, err := newDockerClient(s.Host)
	if err != nil {
		sink.State(StateDown, err)
		return err
	}
	cursor := s.loadCursor()
	backfill := s.Backfill
	if backfill <= 0 {
		backfill = 5 * time.Minute
	}
	sink.State(StateConnecting, nil)
	for ctx.Err() == nil {
		state, err := client.inspect(ctx, s.Container)
		if err != nil {
			sink.State(StateDown, err)
			if !sleepContext(ctx, 5*time.Second) {
				break
			}
			continue
		}
		if !state.Running {
			sink.State(StateDown, fmt.Errorf("container %q is not running", s.Container))
			if !sleepContext(ctx, 5*time.Second) {
				break
			}
			continue
		}
		since := cursor
		if since.IsZero() {
			since = time.Now().Add(-backfill)
			if state.StartedAt.After(since) {
				since = state.StartedAt
			}
		}
		response, err := client.logs(ctx, s.Container, since)
		if err != nil {
			sink.State(StateDown, err)
			if !sleepContext(ctx, 5*time.Second) {
				break
			}
			continue
		}
		sink.State(StateConnected, nil)
		last, streamErr := s.consume(ctx, response.Body, state.TTY, cursor, sink)
		response.Body.Close()
		if !last.IsZero() {
			cursor = last
			s.saveCursor(cursor)
		}
		if ctx.Err() != nil {
			break
		}
		if streamErr != nil {
			sink.State(StateDown, streamErr)
		} else {
			sink.State(StateDown, fmt.Errorf("log stream of %q ended", s.Container))
		}
		if !sleepContext(ctx, 2*time.Second) {
			break
		}
	}
	s.saveCursor(cursor)
	return nil
}

func (s *DockerSource) consume(ctx context.Context, body io.Reader, tty bool, after time.Time, sink Sink) (time.Time, error) {
	var last time.Time
	lastSaved := time.Now()
	handle := func(raw string) {
		stamp, text := splitDockerTimestamp(raw)
		if !stamp.IsZero() {
			if !after.IsZero() && !stamp.After(after) {
				return
			}
			last = stamp
		}
		if cleaned := Clean(text); cleaned != "" {
			sink.Line(Line{Text: cleaned, ReceivedAt: time.Now(), SourceTime: stamp})
		}
		if time.Since(lastSaved) > 2*time.Second && !last.IsZero() {
			s.saveCursor(last)
			lastSaved = time.Now()
		}
	}
	if tty {
		return last, readLines(body, handle)
	}
	err := demultiplex(body, handle)
	if ctx.Err() != nil {
		return last, nil
	}
	return last, err
}

func PipePath(raw string) string {
	path := strings.ReplaceAll(strings.TrimLeft(raw, `/\`), "/", `\`)
	if strings.HasPrefix(strings.ToLower(path), `.\pipe\`) {
		return `\\` + path
	}
	return `\\.\pipe\` + path
}

func splitDockerTimestamp(raw string) (time.Time, string) {
	stamp, text, found := strings.Cut(raw, " ")
	if !found {
		return time.Time{}, raw
	}
	parsed, err := time.Parse(time.RFC3339Nano, stamp)
	if err != nil {
		return time.Time{}, raw
	}
	return parsed, text
}

func demultiplex(reader io.Reader, handle func(string)) error {
	buffered := bufio.NewReaderSize(reader, 64*1024)
	partial := map[byte]*strings.Builder{}
	header := make([]byte, 8)
	for {
		if _, err := io.ReadFull(buffered, header); err != nil {
			for _, builder := range partial {
				if builder.Len() > 0 {
					handle(strings.TrimRight(builder.String(), "\r\n"))
				}
			}
			if errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
				return nil
			}
			return err
		}
		stream := header[0]
		size := binary.BigEndian.Uint32(header[4:8])
		payload := make([]byte, size)
		if _, err := io.ReadFull(buffered, payload); err != nil {
			return err
		}
		builder := partial[stream]
		if builder == nil {
			builder = &strings.Builder{}
			partial[stream] = builder
		}
		text := string(payload)
		for {
			index := strings.IndexByte(text, '\n')
			if index < 0 {
				builder.WriteString(text)
				break
			}
			builder.WriteString(text[:index])
			handle(strings.TrimRight(builder.String(), "\r"))
			builder.Reset()
			text = text[index+1:]
		}
	}
}
