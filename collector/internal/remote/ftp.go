package remote

import (
	"context"
	"crypto/tls"
	"io"
	"net"
	"net/url"
	"path"
	"sync"
	"time"

	"github.com/jlaffaye/ftp"
)

type ftpSession struct {
	conn *ftp.ServerConn
	once sync.Once
	done chan struct{}
}

func dialFTP(ctx context.Context, target *url.URL, user, password string, secure bool, timeout time.Duration) (*ftpSession, error) {
	port := target.Port()
	if port == "" {
		port = "21"
	}
	options := []ftp.DialOption{ftp.DialWithContext(ctx), ftp.DialWithTimeout(timeout)}
	if secure {
		options = append(options, ftp.DialWithExplicitTLS(&tls.Config{ServerName: target.Hostname(), MinVersion: tls.VersionTLS12}))
	}
	conn, err := ftp.Dial(net.JoinHostPort(target.Hostname(), port), options...)
	if err != nil {
		return nil, err
	}
	if err := conn.Login(user, password); err != nil {
		conn.Quit()
		return nil, err
	}
	session := &ftpSession{conn: conn, done: make(chan struct{})}
	go func() {
		select {
		case <-ctx.Done():
			session.Close()
		case <-session.done:
		}
	}()
	return session, nil
}

func (s *ftpSession) List(ctx context.Context, dir string) ([]Entry, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	listed, err := s.conn.List(dir)
	if err != nil {
		return nil, err
	}
	entries := make([]Entry, 0, len(listed))
	for _, item := range listed {
		entry := Entry{Name: item.Name, Size: int64(item.Size), Modified: item.Time, Dir: item.Type == ftp.EntryTypeFolder}
		if item.Type == ftp.EntryTypeLink {
			continue
		}
		if !entry.Dir && entry.Name == levelFile && !s.conn.IsTimePreciseInList() {
			if precise, err := s.conn.GetTime(path.Join(dir, entry.Name)); err == nil {
				entry.Modified = precise
			}
		}
		entries = append(entries, entry)
	}
	return entries, nil
}

func (s *ftpSession) Fetch(ctx context.Context, file string, w io.Writer) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	response, err := s.conn.Retr(file)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(w, response)
	closeErr := response.Close()
	if copyErr != nil {
		return copyErr
	}
	return closeErr
}

func (s *ftpSession) Close() error {
	var err error
	s.once.Do(func() {
		close(s.done)
		err = s.conn.Quit()
	})
	return err
}
