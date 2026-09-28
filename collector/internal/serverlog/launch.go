package serverlog

import (
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type LaunchSpec struct {
	Command string
	Args    []string
	Dir     string
}

type Process interface {
	Pid() int
	Output() io.Reader
	Wait() (int, error)
	Interrupt() error
	Kill() error
	Close() error
}

var (
	startPlatformProcess func(spec LaunchSpec) (Process, error)
	prepareCommand       = func(cmd *exec.Cmd) {}
	signalProcess        = func(process *os.Process, sig os.Signal) error {
		return process.Signal(sig)
	}
)

func ResolveLaunch(spec LaunchSpec) (LaunchSpec, bool) {
	if !strings.EqualFold(filepath.Base(spec.Command), "PalServer.exe") {
		return spec, false
	}
	shipping := filepath.Join(filepath.Dir(spec.Command), "Pal", "Binaries", "Win64", "PalServer-Win64-Shipping-Cmd.exe")
	if _, err := os.Stat(shipping); err != nil {
		return spec, false
	}
	args := spec.Args
	if len(args) == 0 || !strings.EqualFold(args[0], "Pal") {
		args = append([]string{"Pal"}, args...)
	}
	return LaunchSpec{Command: shipping, Args: args, Dir: filepath.Dir(shipping)}, true
}

func StartProcess(spec LaunchSpec) (Process, error) {
	if spec.Command == "" {
		return nil, errors.New("launch.command is empty")
	}
	if spec.Dir == "" {
		spec.Dir = filepath.Dir(spec.Command)
	}
	if startPlatformProcess != nil {
		return startPlatformProcess(spec)
	}
	return startPipeProcess(spec)
}

func WithLaunchFlags(args []string, enableGameData bool) ([]string, []string) {
	var added []string
	has := func(prefix string) bool {
		for _, arg := range args {
			lower := strings.ToLower(strings.TrimLeft(arg, "-"))
			if lower == prefix || strings.HasPrefix(lower, prefix+"=") {
				return true
			}
		}
		return false
	}
	out := append([]string(nil), args...)
	if !has("logformat") {
		out = append(out, "-logformat=json")
		added = append(added, "-logformat=json")
	}
	if enableGameData && !has("enable-gamedata-api") {
		out = append(out, "-enable-gamedata-api")
		added = append(added, "-enable-gamedata-api")
	}
	return out, added
}

type pipeProcess struct {
	cmd    *exec.Cmd
	output *os.File
	code   int
	err    error
	done   chan struct{}
}

func startPipeProcess(spec LaunchSpec) (Process, error) {
	reader, writer, err := os.Pipe()
	if err != nil {
		return nil, err
	}
	cmd := exec.Command(spec.Command, spec.Args...)
	cmd.Dir = spec.Dir
	cmd.Stdout = writer
	cmd.Stderr = writer
	prepareCommand(cmd)
	if err := cmd.Start(); err != nil {
		reader.Close()
		writer.Close()
		return nil, err
	}
	writer.Close()
	process := &pipeProcess{cmd: cmd, output: reader, done: make(chan struct{})}
	go func() {
		err := cmd.Wait()
		process.code = cmd.ProcessState.ExitCode()
		process.err = err
		close(process.done)
	}()
	return process, nil
}

func (p *pipeProcess) Pid() int {
	return p.cmd.Process.Pid
}

func (p *pipeProcess) Output() io.Reader {
	return p.output
}

func (p *pipeProcess) Wait() (int, error) {
	<-p.done
	var exitErr *exec.ExitError
	if errors.As(p.err, &exitErr) {
		return p.code, nil
	}
	return p.code, p.err
}

func (p *pipeProcess) Interrupt() error {
	return signalProcess(p.cmd.Process, os.Interrupt)
}

func (p *pipeProcess) Kill() error {
	return signalProcess(p.cmd.Process, os.Kill)
}

func (p *pipeProcess) Close() error {
	return nil
}

type LaunchSource struct {
	Process      Process
	Mirror       io.Writer
	MirrorFilter func(string) bool
	mu           sync.Mutex
	code         int
	err          error
}

func NewLaunchSource(process Process, mirror io.Writer) *LaunchSource {
	return &LaunchSource{Process: process, Mirror: mirror}
}

func (s *LaunchSource) Name() string {
	return "launch"
}

func (s *LaunchSource) ExitCode() (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.code, s.err
}

func (s *LaunchSource) Run(ctx context.Context, sink Sink) error {
	sink.State(StateConnected, nil)
	readDone := make(chan struct{})
	go func() {
		defer close(readDone)
		output := s.Process.Output()
		if closer, ok := output.(io.Closer); ok {
			defer closer.Close()
		}
		readLines(output, func(raw string) {
			text := Clean(raw)
			if text == "" {
				return
			}
			mirror(s.Mirror, s.MirrorFilter, text)
			sink.Line(Line{Text: text, ReceivedAt: time.Now()})
		})
	}()
	code, err := s.Process.Wait()
	closeDone := make(chan struct{})
	go func() {
		s.Process.Close()
		close(closeDone)
	}()
	select {
	case <-readDone:
	case <-time.After(10 * time.Second):
	}
	select {
	case <-closeDone:
	case <-time.After(5 * time.Second):
	}
	s.mu.Lock()
	s.code = code
	s.err = err
	s.mu.Unlock()
	sink.State(StateEnded, err)
	return err
}
