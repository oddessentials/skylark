package ingest

import (
	"bytes"
	"encoding/json"
)

const (
	MaxBatchEvents = 500
	MaxBatchBytes  = 512 * 1024
)

type CollectorInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	RunID   string `json:"run_id"`
	OS      string `json:"os"`
	Arch    string `json:"arch"`
}

type Batch struct {
	Items []Item
	Body  []byte
}

func Envelope(collector CollectorInfo, server any) ([]byte, error) {
	collectorJSON, err := json.Marshal(collector)
	if err != nil {
		return nil, err
	}
	serverJSON := []byte("null")
	if server != nil {
		if serverJSON, err = json.Marshal(server); err != nil {
			return nil, err
		}
	}
	var prefix bytes.Buffer
	prefix.WriteString(`{"collector":`)
	prefix.Write(collectorJSON)
	prefix.WriteString(`,"server":`)
	prefix.Write(serverJSON)
	prefix.WriteString(`,"events":[`)
	return prefix.Bytes(), nil
}

func Build(prefix []byte, pending []Item, maxEvents, maxBytes int) Batch {
	if maxEvents <= 0 || maxEvents > MaxBatchEvents {
		maxEvents = MaxBatchEvents
	}
	if maxBytes <= 0 || maxBytes > MaxBatchBytes {
		maxBytes = MaxBatchBytes
	}
	budget := maxBytes - len(prefix) - 2
	var chosen []Item
	used := 0
	for _, item := range pending {
		if len(chosen) >= maxEvents {
			break
		}
		size := len(item.Raw)
		if len(chosen) > 0 {
			size++
		}
		if len(chosen) > 0 && used+size > budget {
			break
		}
		chosen = append(chosen, item)
		used += size
	}
	body := make([]byte, 0, len(prefix)+used+2)
	body = append(body, prefix...)
	for i, item := range chosen {
		if i > 0 {
			body = append(body, ',')
		}
		body = append(body, item.Raw...)
	}
	body = append(body, ']', '}')
	return Batch{Items: chosen, Body: body}
}

func Fits(prefix []byte, raw []byte, maxBytes int) bool {
	if maxBytes <= 0 || maxBytes > MaxBatchBytes {
		maxBytes = MaxBatchBytes
	}
	return len(prefix)+len(raw)+2 <= maxBytes
}
