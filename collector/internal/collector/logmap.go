package collector

import (
	"net"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/oddessentials/skylark/collector/internal/event"
	"github.com/oddessentials/skylark/collector/internal/palrest"
	"github.com/oddessentials/skylark/collector/internal/serverlog"
	"github.com/oddessentials/skylark/collector/internal/world"
)

type emission struct {
	Type string
	At   time.Time
	Data any
}

type logMapper struct {
	tracker *world.Tracker
	sendIPs bool
}

var (
	platformUserID = regexp.MustCompile(`^[A-Za-z0-9]+_[A-Za-z0-9_.:-]+$`)
	eventNameChars = regexp.MustCompile(`[^a-z0-9_]+`)
)

const maxChatRunes = 2000

func looksLikeIP(value string) bool {
	value = strings.TrimSpace(value)
	if value == "" {
		return false
	}
	if net.ParseIP(value) != nil {
		return true
	}
	if host, _, err := net.SplitHostPort(value); err == nil && net.ParseIP(host) != nil {
		return true
	}
	return false
}

func isUserID(value string) bool {
	return value != "" && len(value) <= 128 && platformUserID.MatchString(value) && !looksLikeIP(value)
}

func truncateRunes(value string, limit int) string {
	if utf8.RuneCountInString(value) <= limit {
		return value
	}
	runes := []rune(value)
	return string(runes[:limit])
}

func (m *logMapper) Map(rec serverlog.Record, at time.Time) []emission {
	switch rec.Event {
	case "connect":
		if !isUserID(rec.UserID) {
			return nil
		}
		data := event.PlayerConnectedData{UserID: rec.UserID, Name: rec.PlayerName}
		if m.sendIPs && rec.IP != "" {
			data.IP = event.String(rec.IP)
		}
		return []emission{{event.TypePlayerConnected, at, data}}
	case "join":
		if !isUserID(rec.UserID) {
			return nil
		}
		if !m.tracker.LogJoin(rec.UserID, rec.PlayerID, rec.PlayerName) {
			return nil
		}
		playerID := palrest.PlayerUID(rec.PlayerID)
		if playerID == "" {
			playerID = m.tracker.PlayerID(rec.UserID)
		}
		return []emission{{event.TypePlayerJoined, at, event.PlayerJoinedData{
			UserID:   rec.UserID,
			PlayerID: event.String(playerID),
			Name:     rec.PlayerName,
			Source:   event.SourceLog,
		}}}
	case "left":
		if !isUserID(rec.UserID) {
			return nil
		}
		emit, playerID := m.tracker.LogLeft(rec.UserID, rec.PlayerName)
		if !emit {
			return nil
		}
		name := rec.PlayerName
		if name == "" {
			name = m.tracker.Name(rec.UserID)
		}
		return []emission{{event.TypePlayerLeft, at, event.PlayerLeftData{
			UserID:   rec.UserID,
			PlayerID: event.String(playerID),
			Name:     name,
			Source:   event.SourceLog,
		}}}
	case "chat":
		if !isUserID(rec.UserID) || len(rec.Details) < 2 {
			return nil
		}
		var guild *string
		if len(rec.Details) > 2 {
			guild = event.String(rec.Details[2])
		}
		return []emission{{event.TypeChatMessage, at, event.ChatMessageData{
			UserID:    rec.UserID,
			Name:      rec.PlayerName,
			Channel:   rec.Details[0],
			Text:      truncateRunes(rec.Details[1], maxChatRunes),
			GuildName: guild,
		}}}
	case "command":
		if strings.EqualFold(rec.PlayerName, "REST") {
			return nil
		}
		details := redactCommand(rec.Details)
		var userID *string
		if isUserID(rec.UserID) {
			userID = event.String(rec.UserID)
		}
		return []emission{{event.TypeAdminCommand, at, event.AdminCommandData{
			Actor:   rec.PlayerName,
			UserID:  userID,
			Details: details,
		}}}
	case "kick", "ban", "unban":
		if data, ok := moderation(rec); ok {
			types := map[string]string{
				"kick":  event.TypePlayerKicked,
				"ban":   event.TypePlayerBanned,
				"unban": event.TypePlayerUnbanned,
			}
			return []emission{{types[rec.Event], at, data}}
		}
	}
	return []emission{m.other(rec, at)}
}

func redactCommand(details []string) []string {
	out := make([]string, 0, len(details))
	if len(details) == 0 {
		return out
	}
	command := strings.TrimPrefix(strings.TrimSpace(details[0]), "/")
	name, _, _ := strings.Cut(command, " ")
	if strings.EqualFold(name, "AdminPassword") {
		return append(out, "AdminPassword")
	}
	return append(out, details...)
}

func moderation(rec serverlog.Record) (event.ModerationData, bool) {
	data := event.ModerationData{By: rec.PlayerName}
	var rest []string
	for _, detail := range rec.Details {
		switch {
		case data.UserID == "" && isUserID(detail):
			data.UserID = detail
		case data.PlayerID == nil && palrest.IsPlayerUID(detail):
			data.PlayerID = event.String(palrest.PlayerUID(detail))
		default:
			rest = append(rest, detail)
		}
	}
	if data.UserID == "" {
		return event.ModerationData{}, false
	}
	if len(rest) > 0 {
		data.Message = event.String(strings.Join(rest, " "))
	}
	if data.By == "" {
		data.By = "server"
	}
	return data, true
}

func (m *logMapper) other(rec serverlog.Record, at time.Time) emission {
	name := eventNameChars.ReplaceAllString(strings.ToLower(rec.Event), "_")
	name = strings.Trim(name, "_")
	if name == "" || name[0] < 'a' || name[0] > 'z' {
		name = "event_" + name
	}
	if len(name) > 58 {
		name = name[:58]
	}
	details := make([]string, 0, len(rec.Details))
	for _, detail := range rec.Details {
		if !m.sendIPs && looksLikeIP(detail) {
			detail = "[ip]"
		}
		details = append(details, detail)
	}
	data := map[string]any{
		"event":      rec.Event,
		"playername": rec.PlayerName,
		"details":    details,
	}
	if isUserID(rec.UserID) {
		data["user_id"] = rec.UserID
	}
	if playerID := palrest.PlayerUID(rec.PlayerID); playerID != "" {
		data["player_id"] = playerID
	}
	if m.sendIPs && rec.IP != "" {
		data["ip"] = rec.IP
	}
	return emission{"log." + name, at, data}
}
