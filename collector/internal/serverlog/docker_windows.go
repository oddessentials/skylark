package serverlog

import (
	"context"
	"errors"
	"net"
	"os"
	"syscall"
	"time"
)

func init() {
	dialNamedPipe = openNamedPipe
}

const errorPipeBusy = syscall.Errno(231)

func openNamedPipe(ctx context.Context, path string) (net.Conn, error) {
	for {
		file, err := os.OpenFile(path, os.O_RDWR|syscall.FILE_FLAG_OVERLAPPED, 0)
		if err == nil {
			return &pipeConn{file: file, path: path}, nil
		}
		if !errors.Is(err, errorPipeBusy) {
			return nil, err
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(50 * time.Millisecond):
		}
	}
}

type pipeAddr string

func (a pipeAddr) Network() string {
	return "pipe"
}

func (a pipeAddr) String() string {
	return string(a)
}

type pipeConn struct {
	file *os.File
	path string
}

func (c *pipeConn) Read(b []byte) (int, error) {
	return c.file.Read(b)
}

func (c *pipeConn) Write(b []byte) (int, error) {
	return c.file.Write(b)
}

func (c *pipeConn) Close() error {
	return c.file.Close()
}

func (c *pipeConn) LocalAddr() net.Addr {
	return pipeAddr(c.path)
}

func (c *pipeConn) RemoteAddr() net.Addr {
	return pipeAddr(c.path)
}

func (c *pipeConn) SetDeadline(t time.Time) error {
	return c.file.SetDeadline(t)
}

func (c *pipeConn) SetReadDeadline(t time.Time) error {
	return c.file.SetReadDeadline(t)
}

func (c *pipeConn) SetWriteDeadline(t time.Time) error {
	return c.file.SetWriteDeadline(t)
}
