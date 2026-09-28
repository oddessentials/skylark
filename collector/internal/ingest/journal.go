package ingest

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sync"
)

const (
	JournalFileName  = "journal.jsonl"
	CursorFileName   = "journal.cursor"
	RejectedFileName = "journal-rejected.jsonl"
	rewriteThreshold = 16 * 1024 * 1024
)

type Item struct {
	ID    string
	RunID string
	Seq   int64
	Type  string
	Raw   []byte
}

type itemHeader struct {
	ID    string `json:"id"`
	RunID string `json:"run_id"`
	Seq   int64  `json:"seq"`
	Type  string `json:"type"`
}

func ItemFromRaw(raw []byte) (Item, error) {
	var header itemHeader
	if err := json.Unmarshal(raw, &header); err != nil {
		return Item{}, err
	}
	if header.ID == "" || header.Type == "" {
		return Item{}, errors.New("event without id or type")
	}
	return Item{ID: header.ID, RunID: header.RunID, Seq: header.Seq, Type: header.Type, Raw: raw}, nil
}

type Journal struct {
	mu       sync.Mutex
	dir      string
	file     *os.File
	size     int64
	cursorID string
}

func OpenJournal(dir string) (*Journal, []Item, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, nil, fmt.Errorf("journal directory: %w", err)
	}
	j := &Journal{dir: dir}
	if data, err := os.ReadFile(j.path(CursorFileName)); err == nil {
		j.cursorID = string(bytes.TrimSpace(data))
	} else if !errors.Is(err, fs.ErrNotExist) {
		return nil, nil, err
	}
	pending, err := j.load()
	if err != nil {
		return nil, nil, err
	}
	if err := j.writeItems(pending); err != nil {
		return nil, nil, err
	}
	return j, pending, nil
}

func (j *Journal) path(name string) string {
	return filepath.Join(j.dir, name)
}

func (j *Journal) Dir() string {
	return j.dir
}

func (j *Journal) load() ([]Item, error) {
	file, err := os.Open(j.path(JournalFileName))
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	defer file.Close()
	var items []Item
	cursorIndex := -1
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 64*1024), 16*1024*1024)
	for scanner.Scan() {
		line := bytes.TrimSpace(scanner.Bytes())
		if len(line) == 0 {
			continue
		}
		raw := append([]byte(nil), line...)
		item, err := ItemFromRaw(raw)
		if err != nil {
			continue
		}
		items = append(items, item)
		if j.cursorID != "" && item.ID == j.cursorID {
			cursorIndex = len(items) - 1
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return items[cursorIndex+1:], nil
}

func (j *Journal) writeItems(items []Item) error {
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.file != nil {
		j.file.Close()
		j.file = nil
	}
	temp := j.path(JournalFileName + ".tmp")
	var buffer bytes.Buffer
	for _, item := range items {
		buffer.Write(item.Raw)
		buffer.WriteByte('\n')
	}
	if err := os.WriteFile(temp, buffer.Bytes(), 0o644); err != nil {
		return err
	}
	if err := os.Rename(temp, j.path(JournalFileName)); err != nil {
		return err
	}
	file, err := os.OpenFile(j.path(JournalFileName), os.O_WRONLY|os.O_APPEND|os.O_CREATE, 0o644)
	if err != nil {
		return err
	}
	j.file = file
	j.size = int64(buffer.Len())
	return nil
}

func (j *Journal) Append(item Item) error {
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.file == nil {
		return errors.New("journal is closed")
	}
	line := make([]byte, 0, len(item.Raw)+1)
	line = append(line, item.Raw...)
	line = append(line, '\n')
	n, err := j.file.Write(line)
	j.size += int64(n)
	return err
}

func (j *Journal) Acknowledge(lastID string, remaining []Item) error {
	j.mu.Lock()
	j.cursorID = lastID
	err := writeAtomic(j.path(CursorFileName), []byte(lastID+"\n"))
	size := j.size
	j.mu.Unlock()
	if err != nil {
		return err
	}
	if len(remaining) == 0 || size > rewriteThreshold {
		return j.writeItems(remaining)
	}
	return nil
}

func (j *Journal) Rewrite(remaining []Item) error {
	return j.writeItems(remaining)
}

func (j *Journal) Reject(items []Item, reason string) error {
	j.mu.Lock()
	defer j.mu.Unlock()
	file, err := os.OpenFile(j.path(RejectedFileName), os.O_WRONLY|os.O_APPEND|os.O_CREATE, 0o644)
	if err != nil {
		return err
	}
	defer file.Close()
	writer := bufio.NewWriter(file)
	for _, item := range items {
		entry, err := json.Marshal(struct {
			Reason string          `json:"reason"`
			Event  json.RawMessage `json:"event"`
		}{reason, item.Raw})
		if err != nil {
			continue
		}
		writer.Write(entry)
		writer.WriteByte('\n')
	}
	return writer.Flush()
}

func (j *Journal) Close() error {
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.file == nil {
		return nil
	}
	err := j.file.Close()
	j.file = nil
	return err
}

func writeAtomic(path string, data []byte) error {
	temp := path + ".tmp"
	if err := os.WriteFile(temp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(temp, path)
}
