package contract

import (
	"strings"
	"testing"
)

func load(t *testing.T) *Validator {
	t.Helper()
	path, err := Find()
	if err != nil {
		t.Fatal(err)
	}
	validator, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	return validator
}

func TestEverySchemaNamedHereExistsInTheContract(t *testing.T) {
	validator := load(t)
	for _, eventType := range DocumentedTypes() {
		name := EventSchema(eventType)
		if !validator.HasSchema(name) {
			t.Errorf("%s maps to %s, which the contract does not define", eventType, name)
			continue
		}
		if _, err := validator.Schema(name); err != nil {
			t.Errorf("%s: %v", name, err)
		}
	}
	for _, name := range []string{"CollectorEvent", "OtherEvent", "IngestBatch", "IngestResult", "CollectorAction"} {
		if _, err := validator.Schema(name); err != nil {
			t.Errorf("%s: %v", name, err)
		}
	}
}

func TestTheValidatorRejectsBadData(t *testing.T) {
	validator := load(t)
	bad := `{"id":"7c9e6679-7425-40de-944b-e07fc1f90ae7","seq":1,"run_id":"7c9e6679-7425-40de-944b-e07fc1f90ae7","ts":"2026-09-27T20:03:31.000Z","type":"chat.message","data":{"name":"Wanderer","channel":"Global","text":"hello"}}`
	if err := validator.ValidateEvent([]byte(bad)); err == nil || !strings.Contains(err.Error(), "user_id") {
		t.Fatalf("expected a missing user_id error, got %v", err)
	}
	good := strings.Replace(bad, `"name":"Wanderer"`, `"user_id":"steam_76561190000000101","name":"Wanderer"`, 1)
	if err := validator.ValidateEvent([]byte(good)); err != nil {
		t.Fatal(err)
	}
	other := strings.Replace(good, `"type":"chat.message"`, `"type":"log.custom_thing"`, 1)
	if err := validator.ValidateEvent([]byte(other)); err != nil {
		t.Fatal(err)
	}
	badTime := strings.Replace(good, `2026-09-27T20:03:31.000Z`, `2026-09-27 20:03:31`, 1)
	if err := validator.ValidateEvent([]byte(badTime)); err == nil {
		t.Fatal("expected the date-time format to be enforced")
	}
}
