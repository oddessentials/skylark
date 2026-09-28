package logfile

import (
	"os"
	"path/filepath"
	"sync"
)

type File struct {
	mu    sync.Mutex
	path  string
	limit int64
	file  *os.File
	size  int64
}

func Open(path string, limit int64) (*File, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}
	f := &File{path: path, limit: limit}
	if err := f.open(); err != nil {
		return nil, err
	}
	return f, nil
}

func (f *File) Path() string {
	return f.path
}

func (f *File) open() error {
	file, err := os.OpenFile(f.path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return err
	}
	info, err := file.Stat()
	if err != nil {
		file.Close()
		return err
	}
	f.file = file
	f.size = info.Size()
	return nil
}

func (f *File) Write(p []byte) (int, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.file == nil {
		return 0, os.ErrClosed
	}
	if f.limit > 0 && f.size > 0 && f.size+int64(len(p)) > f.limit {
		f.rotate()
	}
	if f.file == nil {
		return 0, os.ErrClosed
	}
	n, err := f.file.Write(p)
	f.size += int64(n)
	return n, err
}

func (f *File) rotate() {
	if err := f.file.Close(); err != nil {
		return
	}
	f.file = nil
	previous := f.path + ".1"
	os.Remove(previous)
	os.Rename(f.path, previous)
	f.open()
}

func (f *File) Close() error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.file == nil {
		return nil
	}
	err := f.file.Close()
	f.file = nil
	return err
}
