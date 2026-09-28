package serverlog

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

type FileSource struct {
	Path       string
	CursorPath string
	Poll       time.Duration
}

type fileCursor struct {
	Path   string `json:"path"`
	Offset int64  `json:"offset"`
}

func (s *FileSource) Name() string {
	return "file"
}

func (s *FileSource) loadCursor() (int64, bool) {
	if s.CursorPath == "" {
		return 0, false
	}
	data, err := os.ReadFile(s.CursorPath)
	if err != nil {
		return 0, false
	}
	var cursor fileCursor
	if json.Unmarshal(data, &cursor) != nil || cursor.Path != s.Path || cursor.Offset < 0 {
		return 0, false
	}
	return cursor.Offset, true
}

func (s *FileSource) saveCursor(offset int64) {
	if s.CursorPath == "" {
		return
	}
	data, err := json.Marshal(fileCursor{Path: s.Path, Offset: offset})
	if err != nil {
		return
	}
	writeFileAtomic(s.CursorPath, data)
}

func writeFileAtomic(path string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	temp := path + ".tmp"
	if err := os.WriteFile(temp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(temp, path)
}

func (s *FileSource) Run(ctx context.Context, sink Sink) error {
	poll := s.Poll
	if poll <= 0 {
		poll = 250 * time.Millisecond
	}
	sink.State(StateConnecting, nil)
	offset, resumed := s.loadCursor()
	var file *os.File
	var info os.FileInfo
	var pending []byte
	lastSaved := offset
	lastCheck := time.Time{}
	connected := false
	closeFile := func() {
		if file != nil {
			file.Close()
			file = nil
		}
	}
	defer func() {
		closeFile()
		s.saveCursor(offset)
	}()
	for {
		if file == nil {
			opened, err := os.Open(s.Path)
			if err != nil {
				if connected || !errors.Is(err, os.ErrNotExist) {
					sink.State(StateDown, err)
				} else {
					sink.State(StateDown, fmt.Errorf("waiting for %s: %w", s.Path, err))
				}
				connected = false
				if !sleepContext(ctx, 2*time.Second) {
					return nil
				}
				continue
			}
			stat, err := opened.Stat()
			if err != nil {
				opened.Close()
				sink.State(StateDown, err)
				if !sleepContext(ctx, 2*time.Second) {
					return nil
				}
				continue
			}
			if !resumed || offset > stat.Size() {
				if resumed {
					offset = 0
				} else {
					offset = stat.Size()
				}
			}
			resumed = true
			file = opened
			info = stat
			pending = pending[:0]
			if _, err := file.Seek(offset, io.SeekStart); err != nil {
				closeFile()
				sink.State(StateDown, err)
				continue
			}
			connected = true
			sink.State(StateConnected, nil)
		}
		buffer := make([]byte, 64*1024)
		for {
			n, err := file.Read(buffer)
			if n > 0 {
				pending = append(pending, buffer[:n]...)
				for {
					index := bytes.IndexByte(pending, '\n')
					if index < 0 {
						break
					}
					raw := string(bytes.TrimRight(pending[:index], "\r"))
					offset += int64(index + 1)
					pending = pending[index+1:]
					if text := Clean(raw); text != "" {
						sink.Line(Line{Text: text, ReceivedAt: time.Now()})
					}
				}
			}
			if err != nil || n == 0 {
				break
			}
		}
		if offset != lastSaved {
			s.saveCursor(offset)
			lastSaved = offset
		}
		if time.Since(lastCheck) > 2*time.Second {
			lastCheck = time.Now()
			current, err := os.Stat(s.Path)
			switch {
			case err != nil:
				closeFile()
			case !os.SameFile(info, current):
				closeFile()
				offset = 0
			case current.Size() < offset:
				closeFile()
				offset = 0
			}
		}
		if !sleepContext(ctx, poll) {
			return nil
		}
	}
}
