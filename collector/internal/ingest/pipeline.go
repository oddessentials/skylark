package ingest

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"sync"
	"time"
)

type Options struct {
	URL              string
	Secret           string
	FlushInterval    time.Duration
	ActionPoll       time.Duration
	RequestTimeout   time.Duration
	MaxPendingBytes  int
	MaxPendingEvents int
	UserAgent        string
	DryRun           io.Writer
	Client           *http.Client
	Now              func() time.Time
}

type EnvelopeFunc func() (CollectorInfo, any)

type Stats struct {
	Depth            int
	Dropped          int64
	AcceptedBatches  int64
	RejectedEvents   int64
	FlaggedEvents    int64
	LastError        string
	FailureStreak    int
	LastAccepted     time.Time
	UnauthorizedSeen bool
}

type Pipeline struct {
	options  Options
	journal  *Journal
	envelope EnvelopeFunc
	logger   *slog.Logger
	actions  chan []Action
	wake     chan struct{}
	sendMu   sync.Mutex

	mu           sync.Mutex
	pending      []Item
	pendingBytes int
	inflight     map[string]bool
	maxEvents    int
	nextAttempt  time.Time
	lastContact  time.Time
	skew         time.Duration
	stats        Stats
}

var droppable = map[string]bool{
	"world.snapshot":      true,
	"server.metrics":      true,
	"collector.heartbeat": true,
}

func NewPipeline(options Options, journal *Journal, replay []Item, envelope EnvelopeFunc, logger *slog.Logger) *Pipeline {
	if options.FlushInterval <= 0 {
		options.FlushInterval = 2 * time.Second
	}
	if options.RequestTimeout <= 0 {
		options.RequestTimeout = 30 * time.Second
	}
	if options.MaxPendingBytes <= 0 {
		options.MaxPendingBytes = 64 * 1024 * 1024
	}
	if options.MaxPendingEvents <= 0 {
		options.MaxPendingEvents = 200000
	}
	if options.Client == nil {
		options.Client = &http.Client{Timeout: options.RequestTimeout}
	}
	if options.Now == nil {
		options.Now = time.Now
	}
	p := &Pipeline{
		options:   options,
		journal:   journal,
		envelope:  envelope,
		logger:    logger,
		actions:   make(chan []Action, 16),
		wake:      make(chan struct{}, 1),
		inflight:  map[string]bool{},
		maxEvents: MaxBatchEvents,
	}
	for _, item := range replay {
		p.pending = append(p.pending, item)
		p.pendingBytes += len(item.Raw)
	}
	if len(replay) > 0 {
		logger.Info("replaying journaled events", "count", len(replay))
	}
	return p
}

func (p *Pipeline) Actions() <-chan []Action {
	return p.actions
}

func (p *Pipeline) Stats() Stats {
	p.mu.Lock()
	defer p.mu.Unlock()
	stats := p.stats
	stats.Depth = len(p.pending)
	return stats
}

func (p *Pipeline) Enqueue(raw []byte) error {
	item, err := ItemFromRaw(raw)
	if err != nil {
		return err
	}
	prefix, err := p.prefix()
	if err != nil {
		return err
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if !Fits(prefix, item.Raw, MaxBatchBytes) {
		p.stats.Dropped++
		return fmt.Errorf("event %s of type %s is %d bytes, too large for a batch", item.ID, item.Type, len(item.Raw))
	}
	if err := p.journal.Append(item); err != nil {
		p.logger.Warn("journal append failed", "error", err)
	}
	p.pending = append(p.pending, item)
	p.pendingBytes += len(item.Raw)
	if len(p.pending) > p.options.MaxPendingEvents || p.pendingBytes > p.options.MaxPendingBytes {
		p.shed()
	}
	return nil
}

func (p *Pipeline) shed() {
	targetBytes := p.options.MaxPendingBytes * 3 / 4
	targetEvents := p.options.MaxPendingEvents * 3 / 4
	bytesNow := p.pendingBytes
	eventsNow := len(p.pending)
	var dropped int64
	for pass := 0; pass < 2 && (bytesNow > targetBytes || eventsNow > targetEvents); pass++ {
		kept := make([]Item, 0, len(p.pending))
		for _, item := range p.pending {
			removable := !p.inflight[item.ID] && (pass == 1 || droppable[item.Type])
			if removable && (bytesNow > targetBytes || eventsNow > targetEvents) {
				bytesNow -= len(item.Raw)
				eventsNow--
				dropped++
				continue
			}
			kept = append(kept, item)
		}
		p.pending = kept
	}
	p.pendingBytes = bytesNow
	p.stats.Dropped += dropped
	if err := p.journal.Rewrite(p.pending); err != nil {
		p.logger.Warn("journal rewrite failed", "error", err)
	}
	p.logger.Warn("event queue over its limit; dropped the oldest events", "dropped", dropped, "remaining", len(p.pending))
}

func (p *Pipeline) Wake() {
	select {
	case p.wake <- struct{}{}:
	default:
	}
}

func (p *Pipeline) prefix() ([]byte, error) {
	collector, server := p.envelope()
	return Envelope(collector, server)
}

func (p *Pipeline) Run(ctx context.Context) {
	ticker := time.NewTicker(p.options.FlushInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		case <-p.wake:
		}
		p.sendReady(ctx)
		p.pollActions(ctx)
	}
}

func (p *Pipeline) pollActions(ctx context.Context) {
	if p.options.ActionPoll <= 0 || p.options.DryRun != nil || ctx.Err() != nil {
		return
	}
	p.mu.Lock()
	now := p.options.Now()
	idle := len(p.pending) == 0 && now.Sub(p.lastContact) >= p.options.ActionPoll && !now.Before(p.nextAttempt)
	skew := p.skew
	p.mu.Unlock()
	if !idle {
		return
	}
	p.sendMu.Lock()
	defer p.sendMu.Unlock()
	prefix, err := p.prefix()
	if err != nil {
		return
	}
	status, body, _, sendErr := p.post(ctx, append(prefix, ']', '}'), skew)
	p.mu.Lock()
	defer p.mu.Unlock()
	p.lastContact = p.options.Now()
	if sendErr != nil || Classify(status, false) != Accepted {
		return
	}
	p.handleResult(body)
}

func (p *Pipeline) sendReady(ctx context.Context) {
	for ctx.Err() == nil {
		p.mu.Lock()
		ready := len(p.pending) > 0 && !p.options.Now().Before(p.nextAttempt)
		p.mu.Unlock()
		if !ready {
			return
		}
		if !p.sendOnce(ctx) {
			return
		}
	}
}

func (p *Pipeline) Flush(ctx context.Context) bool {
	for ctx.Err() == nil {
		p.mu.Lock()
		empty := len(p.pending) == 0
		wait := p.nextAttempt.Sub(p.options.Now())
		p.mu.Unlock()
		if empty {
			return true
		}
		if wait > 0 {
			timer := time.NewTimer(wait)
			select {
			case <-ctx.Done():
				timer.Stop()
				return false
			case <-timer.C:
			}
		}
		p.sendOnce(ctx)
	}
	return false
}

func (p *Pipeline) sendOnce(ctx context.Context) bool {
	p.sendMu.Lock()
	defer p.sendMu.Unlock()
	prefix, err := p.prefix()
	if err != nil {
		p.logger.Error("building the batch envelope failed", "error", err)
		return false
	}
	p.mu.Lock()
	batch := Build(prefix, p.pending, p.maxEvents, MaxBatchBytes)
	for _, item := range batch.Items {
		p.inflight[item.ID] = true
	}
	skew := p.skew
	p.mu.Unlock()
	if len(batch.Items) == 0 {
		return false
	}
	status, body, header, sendErr := p.post(ctx, batch.Body, skew)
	p.mu.Lock()
	defer p.mu.Unlock()
	for _, item := range batch.Items {
		delete(p.inflight, item.ID)
	}
	if sendErr != nil && ctx.Err() != nil {
		return false
	}
	outcome := Classify(status, sendErr != nil)
	switch outcome {
	case Accepted:
		p.remove(batch.Items)
		p.stats.FailureStreak = 0
		p.stats.AcceptedBatches++
		p.stats.LastError = ""
		p.stats.LastAccepted = p.options.Now()
		p.lastContact = p.stats.LastAccepted
		p.stats.UnauthorizedSeen = false
		p.maxEvents = MaxBatchEvents
		p.nextAttempt = time.Time{}
		p.acknowledge(batch.Items)
		p.handleResult(body)
		return true
	case TooLarge:
		if len(batch.Items) <= 1 {
			p.reject(batch.Items, "payload_too_large")
			return true
		}
		p.maxEvents = max(1, len(batch.Items)/2)
		p.logger.Warn("the site refused the batch as too large; splitting it", "events", len(batch.Items))
		return true
	case Unprocessable:
		p.reject(batch.Items, fmt.Sprintf("HTTP %d: %s", status, truncate(string(body), 300)))
		return true
	default:
		p.stats.FailureStreak++
		retryAfter := time.Duration(0)
		if header != nil {
			retryAfter = RetryAfter(header.Get("Retry-After"), p.options.Now())
		}
		delay := Delay(outcome, p.stats.FailureStreak, retryAfter)
		if sendErr != nil {
			p.stats.LastError = sendErr.Error()
		} else {
			p.stats.LastError = fmt.Sprintf("HTTP %d: %s", status, truncate(string(body), 300))
		}
		if outcome == Unauthorized {
			p.stats.UnauthorizedSeen = true
			if header != nil {
				if serverTime, err := http.ParseTime(header.Get("Date")); err == nil {
					observed := serverTime.Sub(p.options.Now())
					if observed > 2*time.Minute || observed < -2*time.Minute {
						p.skew = observed
						p.logger.Warn("the local clock differs from the site clock; compensating", "offset", observed.Round(time.Second).String())
						delay = time.Second
					}
				}
			}
			p.logger.Error("the site refused the signature; check site.url and site.secret", "status", status, "retry_in", delay.Round(time.Second).String())
		} else if p.stats.FailureStreak == 1 || p.stats.FailureStreak%10 == 0 {
			p.logger.Warn("sending failed; retrying", "error", p.stats.LastError, "retry_in", delay.Round(time.Second).String())
		}
		p.nextAttempt = p.options.Now().Add(delay)
		return false
	}
}

func (p *Pipeline) remove(items []Item) {
	sent := make(map[string]bool, len(items))
	for _, item := range items {
		sent[item.ID] = true
	}
	kept := p.pending[:0]
	for _, item := range p.pending {
		if sent[item.ID] {
			p.pendingBytes -= len(item.Raw)
			continue
		}
		kept = append(kept, item)
	}
	for i := len(kept); i < len(p.pending); i++ {
		p.pending[i] = Item{}
	}
	p.pending = kept
}

func (p *Pipeline) acknowledge(items []Item) {
	if len(items) == 0 {
		return
	}
	if err := p.journal.Acknowledge(items[len(items)-1].ID, p.pending); err != nil {
		p.logger.Warn("journal acknowledge failed", "error", err)
	}
}

func (p *Pipeline) reject(items []Item, reason string) {
	p.remove(items)
	p.stats.RejectedEvents += int64(len(items))
	if err := p.journal.Reject(items, reason); err != nil {
		p.logger.Warn("writing rejected events failed", "error", err)
	}
	p.acknowledge(items)
	p.logger.Error("the site rejected events; they were moved aside", "count", len(items), "file", RejectedFileName, "reason", reason)
}

func (p *Pipeline) handleResult(body []byte) {
	result, err := ParseResult(body)
	if err != nil {
		p.logger.Warn("unreadable ingest response", "error", err)
		return
	}
	if result.Invalid > 0 {
		p.stats.FlaggedEvents += int64(result.Invalid)
		p.logger.Warn("the site flagged events whose data did not match the contract", "count", result.Invalid)
	}
	if len(result.Actions) > 0 {
		select {
		case p.actions <- result.Actions:
		default:
		}
	}
}

func (p *Pipeline) post(ctx context.Context, body []byte, skew time.Duration) (int, []byte, http.Header, error) {
	if p.options.DryRun != nil {
		p.options.DryRun.Write(append(append([]byte(nil), body...), '\n'))
		return http.StatusOK, []byte(`{"accepted":0,"duplicates":0,"invalid":0,"last_seq":null,"actions":[]}`), nil, nil
	}
	timestamp := p.options.Now().Add(skew).Unix()
	requestCtx, cancel := context.WithTimeout(ctx, p.options.RequestTimeout)
	defer cancel()
	request, err := http.NewRequestWithContext(requestCtx, http.MethodPost, p.options.URL, bytes.NewReader(body))
	if err != nil {
		return 0, nil, nil, err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(TimestampHeader, strconv.FormatInt(timestamp, 10))
	request.Header.Set(SignatureHeader, Sign(p.options.Secret, timestamp, body))
	if p.options.UserAgent != "" {
		request.Header.Set("User-Agent", p.options.UserAgent)
	}
	response, err := p.options.Client.Do(request)
	if err != nil {
		return 0, nil, nil, err
	}
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, 4*1024*1024))
	if err != nil && !errors.Is(err, io.EOF) {
		return 0, nil, nil, err
	}
	return response.StatusCode, data, response.Header, nil
}

func truncate(value string, limit int) string {
	if len(value) <= limit {
		return value
	}
	return value[:limit]
}
