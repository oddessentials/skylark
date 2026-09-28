package remote

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

type sftpSession struct {
	ssh   *ssh.Client
	files *sftp.Client
	once  sync.Once
	done  chan struct{}
}

func hostKeyCheck(options Options, notice func(string)) ssh.HostKeyCallback {
	return func(_ string, _ net.Addr, key ssh.PublicKey) error {
		seen := ssh.FingerprintSHA256(key)
		if pinned := strings.TrimSpace(options.HostKey); pinned != "" {
			if pinned != seen {
				return fmt.Errorf("the SFTP server's host key is %s, not the %s in saves.host_key", seen, pinned)
			}
			return nil
		}
		if options.HostKeyFile == "" {
			return fmt.Errorf("the SFTP server's host key %s is not pinned; set saves.host_key to it", seen)
		}
		data, err := os.ReadFile(options.HostKeyFile)
		switch {
		case err == nil:
			if pinned := strings.TrimSpace(string(data)); pinned != seen {
				return fmt.Errorf("the SFTP server's host key changed from %s to %s; if the host changed it on purpose, delete %s", pinned, seen, options.HostKeyFile)
			}
			return nil
		case errors.Is(err, os.ErrNotExist):
			if err := os.MkdirAll(filepath.Dir(options.HostKeyFile), 0o755); err != nil {
				return err
			}
			if err := os.WriteFile(options.HostKeyFile, []byte(seen+"\n"), 0o600); err != nil {
				return err
			}
			notice(fmt.Sprintf("trusting the SFTP server's host key %s from now on; saves.host_key pins it explicitly", seen))
			return nil
		default:
			return err
		}
	}
}

func authMethods(password, keyFile string) ([]ssh.AuthMethod, error) {
	var methods []ssh.AuthMethod
	if keyFile != "" {
		data, err := os.ReadFile(keyFile)
		if err != nil {
			return nil, fmt.Errorf("saves.key: %w", err)
		}
		signer, err := ssh.ParsePrivateKey(data)
		var missing *ssh.PassphraseMissingError
		if errors.As(err, &missing) && password != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase(data, []byte(password))
		}
		if err != nil {
			return nil, fmt.Errorf("saves.key: %w", err)
		}
		methods = append(methods, ssh.PublicKeys(signer))
	}
	if password != "" {
		answer := func(_, _ string, questions []string, _ []bool) ([]string, error) {
			answers := make([]string, len(questions))
			for i := range answers {
				answers[i] = password
			}
			return answers, nil
		}
		methods = append(methods, ssh.Password(password), ssh.KeyboardInteractive(answer))
	}
	if len(methods) == 0 {
		return nil, errors.New("SFTP needs saves.password or saves.key")
	}
	return methods, nil
}

func dialSFTP(ctx context.Context, target *url.URL, user, password string, options Options, notice func(string)) (*sftpSession, error) {
	if user == "" {
		return nil, errors.New("saves.remote needs a user name, as in sftp://user@host/path")
	}
	methods, err := authMethods(password, options.KeyFile)
	if err != nil {
		return nil, err
	}
	port := target.Port()
	if port == "" {
		port = "22"
	}
	address := net.JoinHostPort(target.Hostname(), port)
	dialer := net.Dialer{Timeout: options.Timeout}
	conn, err := dialer.DialContext(ctx, "tcp", address)
	if err != nil {
		return nil, err
	}
	conn.SetDeadline(time.Now().Add(options.Timeout))
	config := &ssh.ClientConfig{User: user, Auth: methods, HostKeyCallback: hostKeyCheck(options, notice), Timeout: options.Timeout}
	sshConn, channels, requests, err := ssh.NewClientConn(conn, address, config)
	if err != nil {
		conn.Close()
		return nil, err
	}
	conn.SetDeadline(time.Time{})
	client := ssh.NewClient(sshConn, channels, requests)
	files, err := sftp.NewClient(client)
	if err != nil {
		client.Close()
		return nil, err
	}
	session := &sftpSession{ssh: client, files: files, done: make(chan struct{})}
	go func() {
		select {
		case <-ctx.Done():
			session.Close()
		case <-session.done:
		}
	}()
	return session, nil
}

func (s *sftpSession) List(ctx context.Context, dir string) ([]Entry, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	infos, err := s.files.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	entries := make([]Entry, 0, len(infos))
	for _, info := range infos {
		if info.Mode()&os.ModeSymlink != 0 {
			continue
		}
		entries = append(entries, Entry{Name: info.Name(), Size: info.Size(), Modified: info.ModTime(), Dir: info.IsDir()})
	}
	return entries, nil
}

func (s *sftpSession) Fetch(ctx context.Context, file string, w io.Writer) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	remote, err := s.files.Open(file)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(w, remote)
	closeErr := remote.Close()
	if copyErr != nil {
		return copyErr
	}
	return closeErr
}

func (s *sftpSession) Close() error {
	var err error
	s.once.Do(func() {
		close(s.done)
		err = errors.Join(s.files.Close(), s.ssh.Close())
	})
	return err
}
