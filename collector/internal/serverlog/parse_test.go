package serverlog

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func fixtureLines(t *testing.T, name string) []string {
	t.Helper()
	file, err := os.Open(filepath.Join("testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	var lines []string
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 64*1024), 4*1024*1024)
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}
	return lines
}

func classifyAll(t *testing.T, name string) (map[Kind]int, []Record) {
	t.Helper()
	counts := map[Kind]int{}
	var records []Record
	for _, raw := range fixtureLines(t, name) {
		line := Clean(raw)
		if line == "" {
			continue
		}
		kind, found := Classify(line)
		counts[kind]++
		records = append(records, found...)
	}
	return counts, records
}

func eventNames(records []Record) string {
	names := make([]string, 0, len(records))
	for _, record := range records {
		names = append(names, record.Event+":"+record.PlayerName)
	}
	return strings.Join(names, " ")
}

func TestSessionLogWithTabs(t *testing.T) {
	counts, records := classifyAll(t, "session-json.txt")
	if counts[KindJSON] != 10 || counts[KindText] != 0 {
		t.Fatalf("counts %v", counts)
	}
	want := "command:REST command:REST command:REST connect:Wanderer join:Wanderer chat:Wanderer chat:Wanderer chat:Wanderer chat:Wanderer left:Wanderer"
	if got := eventNames(records); got != want {
		t.Fatalf("got %s", got)
	}
	connect := records[3]
	if connect.UserID != "steam_76561190000000101" || connect.IP != "192.0.2.10" || connect.Timestamp != "2026-09-27 20:02:50" {
		t.Fatalf("connect %+v", connect)
	}
	join := records[4]
	if join.PlayerID != "5E7A11C0000000000000000000000000" {
		t.Fatalf("join %+v", join)
	}
	chat := records[6]
	if strings.Join(chat.Details, "|") != "Guild|guild message|Unnamed Guild" {
		t.Fatalf("chat details %q", chat.Details)
	}
}

func TestWindowsPipeNoise(t *testing.T) {
	counts, records := classifyAll(t, "windows-pipe.txt")
	if counts[KindJSON] != 7 {
		t.Fatalf("counts %v", counts)
	}
	if counts[KindOther] < 8 {
		t.Fatalf("expected the engine log lines, the mis-encoded version line and the status lines as other, got %v", counts)
	}
	if got := eventNames(records[4:]); got != "connect:Wanderer join:Wanderer left:Wanderer" {
		t.Fatalf("got %s", got)
	}
}

func TestConPTYLinesWithSpaces(t *testing.T) {
	counts, records := classifyAll(t, "conpty.txt")
	if counts[KindJSON] != 10 {
		t.Fatalf("counts %v", counts)
	}
	for _, record := range records {
		if record.Event != "command" || record.PlayerName != "REST" || len(record.Details) != 2 {
			t.Fatalf("record %+v", record)
		}
	}
}

func TestTextFormatIsRecognised(t *testing.T) {
	counts, records := classifyAll(t, "text-format.txt")
	if counts[KindText] == 0 || counts[KindJSON] != 0 || len(records) != 0 {
		t.Fatalf("counts %v", counts)
	}
}

func TestAdminEvents(t *testing.T) {
	_, records := classifyAll(t, "admin-json.txt")
	var ban, rcon *Record
	for i := range records {
		switch {
		case records[i].Event == "ban":
			ban = &records[i]
		case records[i].Event == "command" && records[i].PlayerName == "RCON" && rcon == nil:
			rcon = &records[i]
		}
	}
	if ban == nil || len(ban.Details) != 3 || ban.Details[2] != "json ban test" {
		t.Fatalf("ban %+v", ban)
	}
	if rcon == nil || rcon.UserID != "127.0.0.1" || rcon.Details[0] != "Info" {
		t.Fatalf("rcon %+v", rcon)
	}
}

func TestCleanStripsConsoleSequences(t *testing.T) {
	raw := "\x1b[?25l\x1b[2J\x1b[H\x1b]0;PalServer\x07{ \"timestamp\": \"2026-09-27 22:08:31\", \"event\": \"command\" }\x1b[K\r"
	cleaned := Clean(raw)
	if cleaned != `{ "timestamp": "2026-09-27 22:08:31", "event": "command" }` {
		t.Fatalf("cleaned %q", cleaned)
	}
	if kind, records := Classify(cleaned); kind != KindJSON || records[0].Event != "command" {
		t.Fatalf("kind %v records %v", kind, records)
	}
}

func TestClassifyRecoversPrefixedAndConcatenatedObjects(t *testing.T) {
	kind, records := Classify(`garbage{"event":"join","userid":"steam_1"}{"event":"left","userid":"steam_1"}`)
	if kind != KindJSON || len(records) != 2 || records[1].Event != "left" {
		t.Fatalf("kind %v records %+v", kind, records)
	}
	if kind, _ := Classify(`{"not":"an event"}`); kind != KindOther {
		t.Fatalf("an object without an event is not a log record")
	}
}

func TestParseTimestamp(t *testing.T) {
	berlin, err := time.LoadLocation("Europe/Berlin")
	if err != nil {
		t.Fatal(err)
	}
	parsed, ok := ParseTimestamp("2026-09-27 22:19:11", berlin)
	if !ok || parsed.UTC().Format(time.RFC3339) != "2026-09-27T20:19:11Z" {
		t.Fatalf("parsed %v %v", parsed, ok)
	}
	parsed, ok = ParseTimestamp("2026-09-28 02:02:54", time.UTC)
	if !ok || parsed.Format(time.RFC3339) != "2026-09-28T02:02:54Z" {
		t.Fatalf("parsed %v", parsed)
	}
	if _, ok := ParseTimestamp("yesterday", time.UTC); ok {
		t.Fatal("expected a failure")
	}
}

func TestReadLinesHandlesPartialLastLine(t *testing.T) {
	var got []string
	err := readLines(strings.NewReader("one\r\ntwo\nthree"), func(line string) { got = append(got, line) })
	if err != nil || strings.Join(got, ",") != "one,two,three" {
		t.Fatalf("got %q err %v", got, err)
	}
}

func TestWithLaunchFlags(t *testing.T) {
	args, added := WithLaunchFlags([]string{"-port=8211", "-useperfthreads"}, true)
	if strings.Join(args, " ") != "-port=8211 -useperfthreads -logformat=json -enable-gamedata-api" || len(added) != 2 {
		t.Fatalf("args %q added %q", args, added)
	}
	args, added = WithLaunchFlags([]string{"-logformat=text", "-enable-gamedata-api"}, true)
	if strings.Join(args, " ") != "-logformat=text -enable-gamedata-api" || len(added) != 0 {
		t.Fatalf("args %q added %q", args, added)
	}
	args, _ = WithLaunchFlags(nil, false)
	if strings.Join(args, " ") != "-logformat=json" {
		t.Fatalf("args %q", args)
	}
}

func TestPipePath(t *testing.T) {
	cases := map[string]string{
		"//./pipe/docker_engine": `\\.\pipe\docker_engine`,
		"/./pipe/docker_engine":  `\\.\pipe\docker_engine`,
		"docker_engine":          `\\.\pipe\docker_engine`,
	}
	for input, want := range cases {
		if got := PipePath(input); got != want {
			t.Errorf("%s: got %s want %s", input, got, want)
		}
	}
}
