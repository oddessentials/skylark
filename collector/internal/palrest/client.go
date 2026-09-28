package palrest

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

var (
	ErrUnauthorized = errors.New("the server refused the admin password")
	ErrGameDataOff  = errors.New("the game-data API is not enabled on the server (start it with -enable-gamedata-api)")
)

type StatusError struct {
	Method string
	Path   string
	Status int
	Body   string
}

func (e *StatusError) Error() string {
	body := strings.TrimSpace(e.Body)
	if len(body) > 200 {
		body = body[:200]
	}
	if body == "" {
		return fmt.Sprintf("%s %s: HTTP %d", e.Method, e.Path, e.Status)
	}
	return fmt.Sprintf("%s %s: HTTP %d: %s", e.Method, e.Path, e.Status, body)
}

type UnreachableError struct {
	Err error
}

func (e *UnreachableError) Error() string {
	return "server unreachable: " + e.Err.Error()
}

func (e *UnreachableError) Unwrap() error {
	return e.Err
}

func IsUnreachable(err error) bool {
	var target *UnreachableError
	return errors.As(err, &target)
}

type Client struct {
	base     string
	password string
	http     *http.Client
}

func New(restURL, password string, timeout time.Duration) *Client {
	base := strings.TrimRight(restURL, "/")
	if !strings.HasSuffix(base, "/v1/api") {
		base += "/v1/api"
	}
	return &Client{
		base:     base,
		password: password,
		http: &http.Client{
			Timeout: timeout,
			Transport: &http.Transport{
				Proxy:               nil,
				MaxIdleConnsPerHost: 4,
				IdleConnTimeout:     14 * time.Second,
			},
		},
	}
}

func (c *Client) do(ctx context.Context, method, path string, body any) ([]byte, error) {
	var reader io.Reader = http.NoBody
	var payload []byte
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		payload = encoded
		reader = bytes.NewReader(encoded)
	}
	request, err := http.NewRequestWithContext(ctx, method, c.base+path, reader)
	if err != nil {
		return nil, err
	}
	request.SetBasicAuth("admin", c.password)
	if method == http.MethodPost {
		request.ContentLength = int64(len(payload))
		if body != nil {
			request.Header.Set("Content-Type", "application/json")
		}
	}
	response, err := c.http.Do(request)
	if err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, &UnreachableError{Err: err}
	}
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, 64*1024*1024))
	if err != nil {
		return nil, &UnreachableError{Err: err}
	}
	if response.StatusCode == http.StatusUnauthorized {
		return nil, fmt.Errorf("%w (%s)", ErrUnauthorized, strings.TrimSpace(string(data)))
	}
	if response.StatusCode < 200 || response.StatusCode > 299 {
		if path == "/game-data" && response.StatusCode == http.StatusNotFound && strings.Contains(string(data), "not enabled") {
			return nil, ErrGameDataOff
		}
		return nil, &StatusError{Method: method, Path: path, Status: response.StatusCode, Body: string(data)}
	}
	return data, nil
}

func (c *Client) get(ctx context.Context, path string, out any) error {
	data, err := c.do(ctx, http.MethodGet, path, nil)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(data, out); err != nil {
		return fmt.Errorf("GET %s: %w", path, err)
	}
	return nil
}

func (c *Client) Info(ctx context.Context) (Info, error) {
	var info Info
	err := c.get(ctx, "/info", &info)
	return info, err
}

func (c *Client) Settings(ctx context.Context) (map[string]any, error) {
	settings := map[string]any{}
	err := c.get(ctx, "/settings", &settings)
	return settings, err
}

func (c *Client) Metrics(ctx context.Context) (Metrics, error) {
	var metrics Metrics
	err := c.get(ctx, "/metrics", &metrics)
	return metrics, err
}

func (c *Client) Players(ctx context.Context) ([]Player, error) {
	var response struct {
		Players []Player `json:"players"`
	}
	if err := c.get(ctx, "/players", &response); err != nil {
		return nil, err
	}
	if response.Players == nil {
		response.Players = []Player{}
	}
	return response.Players, nil
}

func (c *Client) GameData(ctx context.Context) (GameData, error) {
	var data GameData
	err := c.get(ctx, "/game-data", &data)
	return data, err
}

func (c *Client) Announce(ctx context.Context, message string) error {
	_, err := c.do(ctx, http.MethodPost, "/announce", map[string]string{"message": message})
	return err
}

func (c *Client) Kick(ctx context.Context, userID, message string) error {
	body := map[string]string{"userid": userID}
	if message != "" {
		body["message"] = message
	}
	_, err := c.do(ctx, http.MethodPost, "/kick", body)
	return err
}

func (c *Client) Ban(ctx context.Context, userID, message string) error {
	body := map[string]string{"userid": userID}
	if message != "" {
		body["message"] = message
	}
	_, err := c.do(ctx, http.MethodPost, "/ban", body)
	return err
}

func (c *Client) Unban(ctx context.Context, userID string) error {
	_, err := c.do(ctx, http.MethodPost, "/unban", map[string]string{"userid": userID})
	return err
}

func (c *Client) Save(ctx context.Context) error {
	_, err := c.do(ctx, http.MethodPost, "/save", nil)
	return err
}

func (c *Client) Shutdown(ctx context.Context, waitSeconds int, message string) error {
	body := map[string]any{"waittime": waitSeconds}
	if message != "" {
		body["message"] = message
	}
	_, err := c.do(ctx, http.MethodPost, "/shutdown", body)
	return err
}
