package serverlog

import (
	"bufio"
	"context"
	"io"
	"strings"
	"time"
)

type State string

const (
	StateConnecting State = "connecting"
	StateConnected  State = "connected"
	StateDown       State = "down"
	StateEnded      State = "ended"
)

type Sink interface {
	Line(Line)
	State(State, error)
}

type Source interface {
	Name() string
	Run(ctx context.Context, sink Sink) error
}

func readLines(reader io.Reader, handle func(string)) error {
	buffered := bufio.NewReaderSize(reader, 64*1024)
	var partial strings.Builder
	for {
		chunk, err := buffered.ReadString('\n')
		if len(chunk) > 0 {
			if strings.HasSuffix(chunk, "\n") {
				partial.WriteString(chunk)
				handle(strings.TrimRight(partial.String(), "\r\n"))
				partial.Reset()
			} else {
				partial.WriteString(chunk)
				if partial.Len() > 4*1024*1024 {
					handle(partial.String())
					partial.Reset()
				}
			}
		}
		if err != nil {
			if partial.Len() > 0 {
				handle(strings.TrimRight(partial.String(), "\r\n"))
			}
			if err == io.EOF {
				return nil
			}
			return err
		}
	}
}

func sleepContext(ctx context.Context, d time.Duration) bool {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

type StdinSource struct {
	Reader       io.Reader
	Mirror       io.Writer
	MirrorFilter func(string) bool
}

func mirror(writer io.Writer, filter func(string) bool, text string) {
	if writer == nil || text == "" {
		return
	}
	if filter != nil && !filter(text) {
		return
	}
	io.WriteString(writer, text+"\n")
}

func (s *StdinSource) Name() string {
	return "stdin"
}

func (s *StdinSource) Run(ctx context.Context, sink Sink) error {
	sink.State(StateConnected, nil)
	done := make(chan error, 1)
	go func() {
		done <- readLines(s.Reader, func(raw string) {
			text := Clean(raw)
			mirror(s.Mirror, s.MirrorFilter, text)
			if text != "" {
				sink.Line(Line{Text: text, ReceivedAt: time.Now()})
			}
		})
	}()
	select {
	case <-ctx.Done():
		return nil
	case err := <-done:
		sink.State(StateEnded, err)
		return err
	}
}
