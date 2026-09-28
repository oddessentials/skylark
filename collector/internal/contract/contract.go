package contract

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/santhosh-tekuri/jsonschema/v6"
	"go.yaml.in/yaml/v3"
)

const baseURL = "https://skylark.invalid/openapi.json"

type Validator struct {
	mu       sync.Mutex
	compiler *jsonschema.Compiler
	schemas  map[string]*jsonschema.Schema
	document map[string]any
}

func Find() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		candidate := filepath.Join(dir, "web", "openapi.yaml")
		if _, err := os.Stat(candidate); err == nil {
			return candidate, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", errors.New("web/openapi.yaml not found above the working directory")
		}
		dir = parent
	}
}

func Load(path string) (*Validator, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var parsed any
	if err := yaml.Unmarshal(data, &parsed); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	encoded, err := json.Marshal(normalize(parsed))
	if err != nil {
		return nil, err
	}
	document, err := jsonschema.UnmarshalJSON(bytes.NewReader(encoded))
	if err != nil {
		return nil, err
	}
	compiler := jsonschema.NewCompiler()
	compiler.DefaultDraft(jsonschema.Draft2020)
	compiler.AssertFormat()
	if err := compiler.AddResource(baseURL, document); err != nil {
		return nil, err
	}
	root, _ := document.(map[string]any)
	return &Validator{compiler: compiler, schemas: map[string]*jsonschema.Schema{}, document: root}, nil
}

func normalize(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		out := make(map[string]any, len(typed))
		for key, entry := range typed {
			out[key] = normalize(entry)
		}
		return out
	case map[any]any:
		out := make(map[string]any, len(typed))
		for key, entry := range typed {
			out[fmt.Sprint(key)] = normalize(entry)
		}
		return out
	case []any:
		out := make([]any, len(typed))
		for i, entry := range typed {
			out[i] = normalize(entry)
		}
		return out
	default:
		return typed
	}
}

func (v *Validator) Schema(name string) (*jsonschema.Schema, error) {
	v.mu.Lock()
	defer v.mu.Unlock()
	if schema, ok := v.schemas[name]; ok {
		return schema, nil
	}
	schema, err := v.compiler.Compile(baseURL + "#/components/schemas/" + name)
	if err != nil {
		return nil, err
	}
	v.schemas[name] = schema
	return schema, nil
}

func (v *Validator) HasSchema(name string) bool {
	components, _ := v.document["components"].(map[string]any)
	schemas, _ := components["schemas"].(map[string]any)
	_, ok := schemas[name]
	return ok
}

func (v *Validator) ValidateJSON(name string, raw []byte) error {
	schema, err := v.Schema(name)
	if err != nil {
		return err
	}
	instance, err := jsonschema.UnmarshalJSON(bytes.NewReader(raw))
	if err != nil {
		return err
	}
	return schema.Validate(instance)
}

func (v *Validator) ValidateValue(name string, value any) error {
	raw, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return v.ValidateJSON(name, raw)
}

var eventSchemas = map[string]string{
	"collector.started":   "CollectorStartedEvent",
	"collector.heartbeat": "CollectorHeartbeatEvent",
	"server.online":       "ServerOnlineEvent",
	"server.offline":      "ServerOfflineEvent",
	"server.metrics":      "ServerMetricsEvent",
	"world.snapshot":      "WorldSnapshotEvent",
	"player.connected":    "PlayerConnectedEvent",
	"player.joined":       "PlayerJoinedEvent",
	"player.left":         "PlayerLeftEvent",
	"player.level_up":     "PlayerLevelUpEvent",
	"player.died":         "PlayerDiedEvent",
	"chat.message":        "ChatMessageEvent",
	"admin.command":       "AdminCommandEvent",
	"player.kicked":       "PlayerKickedEvent",
	"player.banned":       "PlayerBannedEvent",
	"player.unbanned":     "PlayerUnbannedEvent",
	"action.completed":    "ActionCompletedEvent",
	"action.failed":       "ActionFailedEvent",
	"save.player":         "SavePlayerEvent",
	"save.guild":          "SaveGuildEvent",
	"save.base":           "SaveBaseEvent",
	"save.read":           "SaveReadEvent",
}

func EventSchema(eventType string) string {
	if name, ok := eventSchemas[eventType]; ok {
		return name
	}
	return "OtherEvent"
}

func (v *Validator) ContractTypes() []string {
	schemas, _ := v.document["components"].(map[string]any)["schemas"].(map[string]any)
	event, _ := schemas["CollectorEvent"].(map[string]any)
	options, _ := event["anyOf"].([]any)
	var types []string
	for _, option := range options {
		ref, _ := option.(map[string]any)["$ref"].(string)
		schema, _ := schemas[ref[strings.LastIndex(ref, "/")+1:]].(map[string]any)
		parts, _ := schema["allOf"].([]any)
		for _, part := range parts {
			properties, _ := part.(map[string]any)["properties"].(map[string]any)
			typeSchema, _ := properties["type"].(map[string]any)
			if value, ok := typeSchema["const"].(string); ok {
				types = append(types, value)
			}
		}
	}
	return types
}

func DocumentedTypes() []string {
	types := make([]string, 0, len(eventSchemas))
	for eventType := range eventSchemas {
		types = append(types, eventType)
	}
	return types
}

func (v *Validator) ValidateEvent(raw []byte) error {
	var header struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(raw, &header); err != nil {
		return err
	}
	if err := v.ValidateJSON(EventSchema(header.Type), raw); err != nil {
		return fmt.Errorf("%s: %w", header.Type, err)
	}
	if err := v.ValidateJSON("CollectorEvent", raw); err != nil {
		return fmt.Errorf("%s as CollectorEvent: %w", header.Type, err)
	}
	return nil
}
