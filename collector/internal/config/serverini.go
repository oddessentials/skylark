package config

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
)

type ServerIni struct {
	Path           string
	AdminPassword  string
	RESTAPIPort    int
	RESTAPIEnabled bool
	LogFormatType  string
	Values         map[string]string
}

func FindServerIni(serverDir, userDir, platform string) (*ServerIni, error) {
	if platform == "" {
		platform = runtime.GOOS
	}
	platforms := []string{"WindowsServer", "LinuxServer"}
	if platform != "windows" {
		platforms = []string{"LinuxServer", "WindowsServer"}
	}
	var candidates []string
	if userDir != "" {
		for _, name := range platforms {
			candidates = append(candidates, filepath.Join(userDir, "Saved", "Config", name, "PalWorldSettings.ini"))
		}
	}
	if serverDir != "" {
		for _, name := range platforms {
			candidates = append(candidates, filepath.Join(serverDir, "Pal", "Saved", "Config", name, "PalWorldSettings.ini"))
		}
	}
	for _, candidate := range candidates {
		ini, err := ReadServerIni(candidate)
		if err == nil {
			return ini, nil
		}
		if !errors.Is(err, os.ErrNotExist) {
			return nil, err
		}
	}
	return nil, fmt.Errorf("no PalWorldSettings.ini found (looked in %s); the server writes it on its first start", strings.Join(candidates, ", "))
}

func ReadServerIni(path string) (*ServerIni, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 64*1024), 4*1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(strings.TrimPrefix(scanner.Text(), string(rune(0xFEFF))))
		if !strings.HasPrefix(line, "OptionSettings=") {
			continue
		}
		values, err := ParseOptionSettings(strings.TrimPrefix(line, "OptionSettings="))
		if err != nil {
			return nil, fmt.Errorf("%s: %w", path, err)
		}
		ini := &ServerIni{Path: path, Values: values, RESTAPIPort: 8212}
		ini.AdminPassword = values["AdminPassword"]
		ini.LogFormatType = values["LogFormatType"]
		ini.RESTAPIEnabled = strings.EqualFold(values["RESTAPIEnabled"], "true")
		if port, err := strconv.Atoi(values["RESTAPIPort"]); err == nil && port > 0 {
			ini.RESTAPIPort = port
		}
		return ini, nil
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return nil, fmt.Errorf("%s: no OptionSettings line", path)
}

func ParseOptionSettings(value string) (map[string]string, error) {
	value = strings.TrimSpace(value)
	if !strings.HasPrefix(value, "(") || !strings.HasSuffix(value, ")") {
		return nil, errors.New("OptionSettings must be enclosed in parentheses")
	}
	body := value[1 : len(value)-1]
	values := map[string]string{}
	var entries []string
	depth := 0
	inQuotes := false
	start := 0
	for i := 0; i < len(body); i++ {
		switch body[i] {
		case '"':
			inQuotes = !inQuotes
		case '(':
			if !inQuotes {
				depth++
			}
		case ')':
			if !inQuotes {
				depth--
			}
		case ',':
			if !inQuotes && depth == 0 {
				entries = append(entries, body[start:i])
				start = i + 1
			}
		}
	}
	entries = append(entries, body[start:])
	for _, entry := range entries {
		key, raw, found := strings.Cut(entry, "=")
		if !found {
			continue
		}
		key = strings.TrimSpace(key)
		raw = strings.TrimSpace(raw)
		if len(raw) >= 2 && raw[0] == '"' && raw[len(raw)-1] == '"' {
			raw = raw[1 : len(raw)-1]
		}
		values[key] = raw
	}
	return values, nil
}

type LaunchArgs struct {
	UserDir       string
	AdminPassword string
	RESTAPIPort   int
	RESTAPI       bool
	LogFormat     string
	GameDataAPI   bool
}

func ParseLaunchArgs(args []string) LaunchArgs {
	var parsed LaunchArgs
	for _, arg := range args {
		name, value, hasValue := strings.Cut(strings.TrimLeft(arg, "-"), "=")
		if !strings.HasPrefix(arg, "-") {
			continue
		}
		value = strings.Trim(value, "\"")
		switch strings.ToLower(name) {
		case "userdir":
			if hasValue {
				parsed.UserDir = value
			}
		case "adminpassword":
			if hasValue {
				parsed.AdminPassword = value
			}
		case "restapiport":
			if port, err := strconv.Atoi(value); err == nil && port > 0 {
				parsed.RESTAPIPort = port
			}
		case "restapi":
			parsed.RESTAPI = true
		case "logformat":
			if hasValue {
				parsed.LogFormat = value
			}
		case "enable-gamedata-api":
			parsed.GameDataAPI = true
		}
	}
	return parsed
}
