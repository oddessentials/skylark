package event

import (
	"encoding/json"
	"regexp"
	"testing"
	"time"
)

func TestFactoryNumbersEventsAndFormatsTime(t *testing.T) {
	factory := NewFactory(NewUUID())
	berlin, err := time.LoadLocation("Europe/Berlin")
	if err != nil {
		t.Fatal(err)
	}
	at := time.Date(2026, 9, 27, 22, 19, 11, 123456789, berlin)
	first, err := factory.New(TypeServerOffline, at, ServerOfflineData{Reason: OfflineShutdown})
	if err != nil {
		t.Fatal(err)
	}
	second, _ := factory.New(TypeServerOffline, at, ServerOfflineData{Reason: OfflineShutdown})
	if first.Seq != 1 || second.Seq != 2 || first.RunID != second.RunID || first.ID == second.ID {
		t.Fatalf("first %+v second %+v", first, second)
	}
	if first.TS != "2026-09-27T20:19:11.123Z" {
		t.Fatalf("ts %s", first.TS)
	}
	uuid := regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
	if !uuid.MatchString(first.ID) || !uuid.MatchString(first.RunID) {
		t.Fatalf("ids %s %s", first.ID, first.RunID)
	}
	raw, _ := first.Marshal()
	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil || decoded["data"].(map[string]any)["reason"] != "shutdown" {
		t.Fatalf("raw %s", raw)
	}
	if _, err := factory.New(TypeChatMessage, at, []string{"not an object"}); err == nil {
		t.Fatal("data must be an object")
	}
}
