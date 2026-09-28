package serverlog

import (
	"encoding/json"
	"io"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type Kind int

const (
	KindOther Kind = iota
	KindJSON
	KindText
)

type Record struct {
	Timestamp  string
	Event      string
	PlayerName string
	UserID     string
	PlayerID   string
	IP         string
	Details    []string
	Fields     map[string]any
}

type Line struct {
	Text       string
	ReceivedAt time.Time
	SourceTime time.Time
}

var (
	vtSequence = regexp.MustCompile(`\x1b\[[0-9;?<=>]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][0-9A-Za-z]|\x1b[=>78DEHMNOZc]`)
	textFormat = regexp.MustCompile(`^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] \[(LOG|CHAT)\]`)
)

func Clean(raw string) string {
	cleaned := vtSequence.ReplaceAllString(raw, "")
	var out strings.Builder
	out.Grow(len(cleaned))
	for _, r := range cleaned {
		if r == '\t' || r >= 0x20 && r != 0x7f && r != 0xfffd {
			out.WriteRune(r)
		}
	}
	return strings.TrimSpace(out.String())
}

func Classify(line string) (Kind, []Record) {
	if start := strings.IndexByte(line, '{'); start >= 0 {
		records := decodeRecords(line[start:])
		if len(records) > 0 {
			return KindJSON, records
		}
	}
	if textFormat.MatchString(line) {
		return KindText, nil
	}
	return KindOther, nil
}

func decodeRecords(text string) []Record {
	decoder := json.NewDecoder(strings.NewReader(text))
	decoder.UseNumber()
	var records []Record
	for {
		var fields map[string]any
		if err := decoder.Decode(&fields); err != nil {
			if err != io.EOF && len(records) == 0 {
				return nil
			}
			return records
		}
		record, ok := recordFrom(fields)
		if !ok {
			return records
		}
		records = append(records, record)
	}
}

func recordFrom(fields map[string]any) (Record, bool) {
	name, ok := fields["event"].(string)
	if !ok || name == "" {
		return Record{}, false
	}
	record := Record{
		Event:      name,
		Timestamp:  stringField(fields, "timestamp"),
		PlayerName: stringField(fields, "playername"),
		UserID:     stringField(fields, "userid"),
		PlayerID:   stringField(fields, "playerid"),
		IP:         stringField(fields, "ip"),
		Fields:     fields,
	}
	if details, ok := fields["details"].([]any); ok {
		record.Details = make([]string, 0, len(details))
		for _, detail := range details {
			record.Details = append(record.Details, toString(detail))
		}
	}
	return record, true
}

func stringField(fields map[string]any, key string) string {
	value, present := fields[key]
	if !present || value == nil {
		return ""
	}
	return toString(value)
}

func toString(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case json.Number:
		return typed.String()
	case bool:
		return strconv.FormatBool(typed)
	case nil:
		return ""
	default:
		encoded, err := json.Marshal(typed)
		if err != nil {
			return ""
		}
		return string(encoded)
	}
}

func ParseTimestamp(value string, location *time.Location) (time.Time, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}, false
	}
	if location == nil {
		location = time.UTC
	}
	for _, layout := range []string{"2006-01-02 15:04:05", "2006.01.02-15.04.05", time.RFC3339Nano} {
		if parsed, err := time.ParseInLocation(layout, value, location); err == nil {
			return parsed, true
		}
	}
	return time.Time{}, false
}
