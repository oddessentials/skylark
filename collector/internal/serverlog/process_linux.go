package serverlog

import (
	"os"
	"os/exec"
	"syscall"
)

func init() {
	prepareCommand = func(cmd *exec.Cmd) {
		cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	}
	signalProcess = func(process *os.Process, sig os.Signal) error {
		unixSignal, ok := sig.(syscall.Signal)
		if !ok {
			return process.Signal(sig)
		}
		if err := syscall.Kill(-process.Pid, unixSignal); err != nil {
			return process.Signal(sig)
		}
		return nil
	}
}
