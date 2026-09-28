package event

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sync"
	"time"
)

type Event struct {
	ID    string          `json:"id"`
	Seq   int64           `json:"seq"`
	RunID string          `json:"run_id"`
	TS    string          `json:"ts"`
	Type  string          `json:"type"`
	Data  json.RawMessage `json:"data"`
}

func (e Event) Marshal() ([]byte, error) {
	return json.Marshal(e)
}

type Factory struct {
	mu    sync.Mutex
	runID string
	seq   int64
}

func NewFactory(runID string) *Factory {
	return &Factory{runID: runID}
}

func (f *Factory) RunID() string {
	return f.runID
}

func (f *Factory) New(eventType string, at time.Time, data any) (Event, error) {
	raw, err := json.Marshal(data)
	if err != nil {
		return Event{}, fmt.Errorf("event %s: %w", eventType, err)
	}
	if len(raw) == 0 || raw[0] != '{' {
		return Event{}, fmt.Errorf("event %s: data must be a JSON object", eventType)
	}
	f.mu.Lock()
	f.seq++
	seq := f.seq
	f.mu.Unlock()
	return Event{
		ID:    NewUUID(),
		Seq:   seq,
		RunID: f.runID,
		TS:    FormatTime(at),
		Type:  eventType,
		Data:  raw,
	}, nil
}

func FormatTime(t time.Time) string {
	return t.UTC().Format("2006-01-02T15:04:05.000Z")
}

func NewUUID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err)
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	var out [36]byte
	hex.Encode(out[0:8], b[0:4])
	out[8] = '-'
	hex.Encode(out[9:13], b[4:6])
	out[13] = '-'
	hex.Encode(out[14:18], b[6:8])
	out[18] = '-'
	hex.Encode(out[19:23], b[8:10])
	out[23] = '-'
	hex.Encode(out[24:36], b[10:16])
	return string(out[:])
}
