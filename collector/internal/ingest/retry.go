package ingest

import (
	"math/rand/v2"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type Outcome int

const (
	Accepted Outcome = iota
	Unauthorized
	TooLarge
	Unprocessable
	RateLimited
	Retryable
)

func (o Outcome) String() string {
	switch o {
	case Accepted:
		return "accepted"
	case Unauthorized:
		return "unauthorized"
	case TooLarge:
		return "too large"
	case Unprocessable:
		return "unprocessable"
	case RateLimited:
		return "rate limited"
	default:
		return "retryable"
	}
}

func Classify(status int, transportFailed bool) Outcome {
	switch {
	case transportFailed:
		return Retryable
	case status >= 200 && status < 300:
		return Accepted
	case status == http.StatusUnauthorized || status == http.StatusForbidden:
		return Unauthorized
	case status == http.StatusRequestEntityTooLarge:
		return TooLarge
	case status == http.StatusBadRequest || status == http.StatusUnprocessableEntity:
		return Unprocessable
	case status == http.StatusTooManyRequests:
		return RateLimited
	default:
		return Retryable
	}
}

const (
	minDelay          = time.Second
	maxDelay          = 60 * time.Second
	unauthorizedStart = 30 * time.Second
	unauthorizedMax   = 5 * time.Minute
	rateLimitedDelay  = 30 * time.Second
)

func Delay(outcome Outcome, failures int, retryAfter time.Duration) time.Duration {
	if failures < 1 {
		failures = 1
	}
	var delay time.Duration
	switch outcome {
	case Unauthorized:
		delay = backoff(unauthorizedStart, unauthorizedMax, failures)
	case RateLimited:
		delay = rateLimitedDelay
		if retryAfter > 0 {
			delay = retryAfter
		}
		return delay
	default:
		delay = backoff(minDelay, maxDelay, failures)
	}
	jitter := time.Duration(float64(delay) * (0.8 + 0.4*rand.Float64()))
	return jitter
}

func backoff(start, limit time.Duration, failures int) time.Duration {
	delay := start
	for i := 1; i < failures && delay < limit; i++ {
		delay *= 2
	}
	if delay > limit {
		delay = limit
	}
	return delay
}

func RetryAfter(header string, now time.Time) time.Duration {
	header = strings.TrimSpace(header)
	if header == "" {
		return 0
	}
	if seconds, err := strconv.Atoi(header); err == nil && seconds >= 0 {
		return time.Duration(seconds) * time.Second
	}
	if at, err := http.ParseTime(header); err == nil {
		if wait := at.Sub(now); wait > 0 {
			return wait
		}
	}
	return 0
}
