package serverlog

import (
	"errors"
	"fmt"
	"io"
	"os"
	"sync"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

func init() {
	startPlatformProcess = startConPTY
}

var procUpdateProcThreadAttribute = windows.NewLazySystemDLL("kernel32.dll").NewProc("UpdateProcThreadAttribute")

type jobAccounting struct {
	TotalUserTime             int64
	TotalKernelTime           int64
	ThisPeriodTotalUserTime   int64
	ThisPeriodTotalKernelTime int64
	TotalPageFaultCount       uint32
	TotalProcesses            uint32
	ActiveProcesses           uint32
	TotalTerminatedProcesses  uint32
}

type conptyProcess struct {
	console   windows.Handle
	process   windows.Handle
	job       windows.Handle
	pid       int
	input     *os.File
	output    *os.File
	closeOnce sync.Once
	waitOnce  sync.Once
	code      int
	waitErr   error
}

func startConPTY(spec LaunchSpec) (Process, error) {
	var inRead, inWrite, outRead, outWrite windows.Handle
	if err := windows.CreatePipe(&inRead, &inWrite, nil, 0); err != nil {
		return nil, fmt.Errorf("creating console input pipe: %w", err)
	}
	if err := windows.CreatePipe(&outRead, &outWrite, nil, 0); err != nil {
		windows.CloseHandle(inRead)
		windows.CloseHandle(inWrite)
		return nil, fmt.Errorf("creating console output pipe: %w", err)
	}
	var console windows.Handle
	if err := windows.CreatePseudoConsole(windows.Coord{X: 32000, Y: 200}, inRead, outWrite, 0, &console); err != nil {
		for _, handle := range []windows.Handle{inRead, inWrite, outRead, outWrite} {
			windows.CloseHandle(handle)
		}
		return nil, fmt.Errorf("creating pseudo console: %w", err)
	}
	cleanup := func() {
		windows.ClosePseudoConsole(console)
		for _, handle := range []windows.Handle{inRead, inWrite, outRead, outWrite} {
			windows.CloseHandle(handle)
		}
	}
	attributes, err := windows.NewProcThreadAttributeList(1)
	if err != nil {
		cleanup()
		return nil, err
	}
	defer attributes.Delete()
	result, _, callErr := procUpdateProcThreadAttribute.Call(
		uintptr(unsafe.Pointer(attributes.List())),
		0,
		windows.PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE,
		uintptr(console),
		unsafe.Sizeof(console),
		0,
		0,
	)
	if result == 0 {
		cleanup()
		return nil, fmt.Errorf("attaching pseudo console: %w", callErr)
	}
	job, err := windows.CreateJobObject(nil, nil)
	if err != nil {
		cleanup()
		return nil, fmt.Errorf("creating job object: %w", err)
	}
	limits := windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION{}
	limits.BasicLimitInformation.LimitFlags = windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
	if _, err := windows.SetInformationJobObject(job, windows.JobObjectExtendedLimitInformation, uintptr(unsafe.Pointer(&limits)), uint32(unsafe.Sizeof(limits))); err != nil {
		windows.CloseHandle(job)
		cleanup()
		return nil, fmt.Errorf("configuring job object: %w", err)
	}
	startup := &windows.StartupInfoEx{ProcThreadAttributeList: attributes.List()}
	startup.Cb = uint32(unsafe.Sizeof(*startup))
	startup.Flags = windows.STARTF_USESTDHANDLES
	commandLine, err := windows.UTF16PtrFromString(windows.ComposeCommandLine(append([]string{spec.Command}, spec.Args...)))
	if err != nil {
		windows.CloseHandle(job)
		cleanup()
		return nil, err
	}
	var directory *uint16
	if spec.Dir != "" {
		directory, err = windows.UTF16PtrFromString(spec.Dir)
		if err != nil {
			windows.CloseHandle(job)
			cleanup()
			return nil, err
		}
	}
	var info windows.ProcessInformation
	flags := uint32(windows.EXTENDED_STARTUPINFO_PRESENT | windows.CREATE_SUSPENDED | windows.CREATE_UNICODE_ENVIRONMENT)
	if err := windows.CreateProcess(nil, commandLine, nil, nil, false, flags, nil, directory, &startup.StartupInfo, &info); err != nil {
		windows.CloseHandle(job)
		cleanup()
		return nil, fmt.Errorf("starting %s: %w", spec.Command, err)
	}
	if err := windows.AssignProcessToJobObject(job, info.Process); err != nil {
		windows.TerminateProcess(info.Process, 1)
		windows.CloseHandle(info.Thread)
		windows.CloseHandle(info.Process)
		windows.CloseHandle(job)
		cleanup()
		return nil, fmt.Errorf("assigning job object: %w", err)
	}
	if _, err := windows.ResumeThread(info.Thread); err != nil {
		windows.TerminateJobObject(job, 1)
		windows.CloseHandle(info.Thread)
		windows.CloseHandle(info.Process)
		windows.CloseHandle(job)
		cleanup()
		return nil, fmt.Errorf("resuming %s: %w", spec.Command, err)
	}
	windows.CloseHandle(info.Thread)
	windows.CloseHandle(inRead)
	windows.CloseHandle(outWrite)
	return &conptyProcess{
		console: console,
		process: info.Process,
		job:     job,
		pid:     int(info.ProcessId),
		input:   os.NewFile(uintptr(inWrite), "conpty-input"),
		output:  os.NewFile(uintptr(outRead), "conpty-output"),
	}, nil
}

func (p *conptyProcess) Pid() int {
	return p.pid
}

func (p *conptyProcess) Output() io.Reader {
	return p.output
}

func (p *conptyProcess) activeProcesses() uint32 {
	var accounting jobAccounting
	if err := windows.QueryInformationJobObject(p.job, windows.JobObjectBasicAccountingInformation, uintptr(unsafe.Pointer(&accounting)), uint32(unsafe.Sizeof(accounting)), nil); err != nil {
		return 0
	}
	return accounting.ActiveProcesses
}

func (p *conptyProcess) Wait() (int, error) {
	p.waitOnce.Do(func() {
		if _, err := windows.WaitForSingleObject(p.process, windows.INFINITE); err != nil {
			p.waitErr = err
			return
		}
		var code uint32
		if err := windows.GetExitCodeProcess(p.process, &code); err != nil {
			p.waitErr = err
		}
		p.code = int(code)
		for p.activeProcesses() > 0 {
			time.Sleep(500 * time.Millisecond)
		}
	})
	return p.code, p.waitErr
}

func (p *conptyProcess) Interrupt() error {
	_, err := p.input.Write([]byte{3})
	return err
}

func (p *conptyProcess) Kill() error {
	if err := windows.TerminateJobObject(p.job, 1); err != nil {
		return errors.Join(err, windows.TerminateProcess(p.process, 1))
	}
	return nil
}

func (p *conptyProcess) Close() error {
	p.closeOnce.Do(func() {
		windows.ClosePseudoConsole(p.console)
		p.input.Close()
		windows.CloseHandle(p.process)
		windows.CloseHandle(p.job)
	})
	return nil
}
