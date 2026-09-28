package ingest

import (
	"encoding/json"
	"fmt"
)

const (
	ActionAnnounce = "announce"
	ActionKick     = "kick"
	ActionBan      = "ban"
	ActionUnban    = "unban"
	ActionSave     = "save"
	ActionShutdown = "shutdown"
)

type Action struct {
	ID        int64   `json:"id"`
	Kind      string  `json:"kind"`
	Message   *string `json:"message"`
	UserID    *string `json:"user_id"`
	WaittimeS *int    `json:"waittime_s"`
}

type Result struct {
	Accepted   int      `json:"accepted"`
	Duplicates int      `json:"duplicates"`
	Invalid    int      `json:"invalid"`
	LastSeq    *int64   `json:"last_seq"`
	Actions    []Action `json:"actions"`
}

func ParseResult(body []byte) (Result, error) {
	var result Result
	if err := json.Unmarshal(body, &result); err != nil {
		return Result{}, fmt.Errorf("ingest response: %w", err)
	}
	return result, nil
}
