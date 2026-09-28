package palrest

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestClientAgainstRecordedResponses(t *testing.T) {
	var mu sync.Mutex
	var posts []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, password, _ := r.BasicAuth()
		if !strings.EqualFold(user, "admin") || password != "secret" {
			w.WriteHeader(http.StatusUnauthorized)
			fmt.Fprint(w, "Unauthorized")
			return
		}
		if r.Method == http.MethodPost {
			body, _ := io.ReadAll(r.Body)
			mu.Lock()
			posts = append(posts, fmt.Sprintf("%s %s %d %s", r.URL.Path, r.Header.Get("Content-Type"), r.ContentLength, body))
			mu.Unlock()
			if r.ContentLength < 0 {
				w.WriteHeader(http.StatusLengthRequired)
			}
			return
		}
		switch r.URL.Path {
		case "/v1/api/players":
			fmt.Fprint(w, "{\n\t\"players\": [\n\t\t{\n\t\t\t\"name\": \"Wanderer\",\n\t\t\t\"accountName\": \"wanderer\",\n\t\t\t\"playerId\": \"None\",\n\t\t\t\"userId\": \"steam_76561190000000101\",\n\t\t\t\"iP\": \"192.0.2.10\",\n\t\t\t\"ping\": 114,\n\t\t\t\"location_x\": -362179.4375,\n\t\t\t\"location_y\": 270846.46875,\n\t\t\t\"level\": 1\n\t\t}\n\t]\n}")
		case "/v1/api/metrics":
			fmt.Fprint(w, `{"currentplayernum":0,"serverfps":60,"serverfpsaverage":59.159999847412109,"serverframetime":16.564674377441406,"days":0,"maxplayernum":32,"basecampnum":0,"uptime":104}`)
		case "/v1/api/game-data":
			w.Header().Set("Content-Type", "text/plain;charset=utf-8")
			w.WriteHeader(http.StatusNotFound)
			fmt.Fprint(w, "PalGameDataBridge GameData API is not enabled")
		case "/v1/api/settings":
			w.Header().Set("Content-Type", "text/plain;charset=utf-8")
			fmt.Fprint(w, `{"DayTimeSpeedRate": 1, "autoSaveSpan": 30, "CrossplayPlatforms": ["Steam", "Xbox"]}`)
		default:
			w.WriteHeader(http.StatusNotFound)
			fmt.Fprint(w, `{"errorCode": "errors.com.epicgames.httpserver.route_handler_not_found", "errorMessage": ""}`)
		}
	}))
	defer server.Close()
	ctx := context.Background()
	client := New(server.URL, "secret", 5*time.Second)
	players, err := client.Players(ctx)
	if err != nil || len(players) != 1 || players[0].PlayerID != "None" || players[0].Level != 1 || players[0].LocationX != -362179.4375 {
		t.Fatalf("players %+v %v", players, err)
	}
	metrics, err := client.Metrics(ctx)
	if err != nil || metrics.ServerFPSAverage == nil || metrics.Uptime != 104 {
		t.Fatalf("metrics %+v %v", metrics, err)
	}
	if _, err := client.GameData(ctx); !errors.Is(err, ErrGameDataOff) {
		t.Fatalf("game data %v", err)
	}
	settings, err := client.Settings(ctx)
	if err != nil || settings["autoSaveSpan"] != 30.0 {
		t.Fatalf("settings served as text/plain are still JSON: %v %v", settings, err)
	}
	if _, err := client.Info(ctx); err == nil {
		t.Fatal("an unknown route is an error")
	}
	if err := client.Save(ctx); err != nil {
		t.Fatal(err)
	}
	if err := client.Kick(ctx, "steam_76561190000000101", ""); err != nil {
		t.Fatal(err)
	}
	if err := client.Shutdown(ctx, 5, "bye"); err != nil {
		t.Fatal(err)
	}
	mu.Lock()
	joined := strings.Join(posts, "\n")
	mu.Unlock()
	for _, want := range []string{"/v1/api/save  0 ", `/v1/api/kick application/json 36 {"userid":"steam_76561190000000101"}`, `/v1/api/shutdown application/json 30 {"message":"bye","waittime":5}`} {
		if !strings.Contains(joined, want) {
			t.Errorf("missing %q in\n%s", want, joined)
		}
	}
	if _, err := New(server.URL, "wrong", time.Second).Players(ctx); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("a wrong password is reported as such: %v", err)
	}
	closed := httptest.NewServer(http.NotFoundHandler())
	closed.Close()
	if _, err := New(closed.URL, "secret", time.Second).Players(ctx); !IsUnreachable(err) {
		t.Fatalf("a closed port is unreachable: %v", err)
	}
}

func TestPlayerUIDs(t *testing.T) {
	cases := map[string]string{
		"5E7A11C0000000000000000000000000": "5E7A11C0000000000000000000000000",
		"5e7a11c0000000000000000000000000": "5E7A11C0000000000000000000000000",
		"00000000000000000000000000000000": "",
		"None":                             "",
		"":                                 "",
	}
	for input, want := range cases {
		if got := PlayerUID(input); got != want {
			t.Errorf("%q: got %q want %q", input, got, want)
		}
	}
	if got := InstancePlayerUID("5E7A11C0000000000000000000000000 : A0000006BBBBBBBBCCCCCCCCD0000006"); got != "5E7A11C0000000000000000000000000" {
		t.Errorf("instance owner %q", got)
	}
	if got := InstancePlayerUID("00000000000000000000000000000000 : 01D6BEE040DBBE9BF361EB9903873809"); got != "" {
		t.Errorf("pals have no owner in their own id: %q", got)
	}
}
