package remotetest

import (
	"crypto/ed25519"
	"crypto/rand"
	"errors"
	"net"
	"testing"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

func HostKey(t testing.TB) ssh.Signer {
	t.Helper()
	_, key, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := ssh.NewSignerFromKey(key)
	if err != nil {
		t.Fatal(err)
	}
	return signer
}

func StartSFTP(t testing.TB, root, user, password string, host ssh.Signer) string {
	t.Helper()
	config := &ssh.ServerConfig{PasswordCallback: func(meta ssh.ConnMetadata, given []byte) (*ssh.Permissions, error) {
		if meta.User() == user && string(given) == password {
			return nil, nil
		}
		return nil, errors.New("wrong password")
	}}
	config.AddHostKey(host)
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { listener.Close() })
	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				return
			}
			go serve(conn, config, root)
		}
	}()
	return listener.Addr().String()
}

func serve(conn net.Conn, config *ssh.ServerConfig, root string) {
	defer conn.Close()
	_, channels, requests, err := ssh.NewServerConn(conn, config)
	if err != nil {
		return
	}
	go ssh.DiscardRequests(requests)
	for incoming := range channels {
		if incoming.ChannelType() != "session" {
			incoming.Reject(ssh.UnknownChannelType, "sessions only")
			continue
		}
		channel, channelRequests, err := incoming.Accept()
		if err != nil {
			return
		}
		go func() {
			for request := range channelRequests {
				ok := request.Type == "subsystem" && len(request.Payload) > 4 && string(request.Payload[4:]) == "sftp"
				request.Reply(ok, nil)
				if ok {
					server, err := sftp.NewServer(channel, sftp.ReadOnly(), sftp.WithServerWorkingDirectory(root))
					if err == nil {
						server.Serve()
					}
					channel.Close()
				}
			}
		}()
	}
}
