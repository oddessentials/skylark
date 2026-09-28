package ingest

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func Probe(ctx context.Context, url, secret string, collector CollectorInfo) (Result, error) {
	prefix, err := Envelope(collector, nil)
	if err != nil {
		return Result{}, err
	}
	body := append(prefix, ']', '}')
	timestamp := time.Now().Unix()
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return Result{}, err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(TimestampHeader, strconv.FormatInt(timestamp, 10))
	request.Header.Set(SignatureHeader, Sign(secret, timestamp, body))
	client := &http.Client{Timeout: 20 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		return Result{}, err
	}
	defer response.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(response.Body, 1024*1024))
	if response.StatusCode < 200 || response.StatusCode > 299 {
		return Result{}, fmt.Errorf("HTTP %d: %s", response.StatusCode, strings.TrimSpace(truncate(string(data), 300)))
	}
	return ParseResult(data)
}
