package world

import (
	"encoding/json"
	"regexp"
	"sort"

	"github.com/oddessentials/skylark/collector/internal/event"
	"github.com/oddessentials/skylark/collector/internal/palrest"
)

type Observation struct {
	UserID   string
	PlayerID string
	Name     string
	Level    int
	Loaded   bool
	HasHP    bool
	HP       float64
	Action   string
	X        float64
	Y        float64
	Z        *float64
}

var clockPattern = regexp.MustCompile(`^[0-9]{2}:[0-9]{2}$`)

func validUserID(userID string) bool {
	return userID != "" && len(userID) <= 128
}

func FromPlayers(players []palrest.Player) (event.WorldSnapshotData, []Observation) {
	data := event.WorldSnapshotData{
		Source:   event.SourceRest,
		Players:  []event.SnapshotPlayer{},
		Pals:     []event.SnapshotPal{},
		PalBoxes: []event.SnapshotPalBox{},
		Wild:     []event.SnapshotWild{},
	}
	observations := make([]Observation, 0, len(players))
	for _, player := range players {
		if !validUserID(player.UserID) {
			continue
		}
		playerID := palrest.PlayerUID(player.PlayerID)
		data.Players = append(data.Players, event.SnapshotPlayer{
			UserID:      player.UserID,
			PlayerID:    event.String(playerID),
			Name:        player.Name,
			AccountName: event.String(player.AccountName),
			Level:       nonNegative(player.Level),
			Ping:        event.Float(player.Ping),
			X:           player.LocationX,
			Y:           player.LocationY,
		})
		observations = append(observations, Observation{
			UserID:   player.UserID,
			PlayerID: playerID,
			Name:     player.Name,
			Level:    player.Level,
			Loaded:   playerID != "",
			X:        player.LocationX,
			Y:        player.LocationY,
		})
	}
	return data, observations
}

func FromGameData(gameData palrest.GameData, players []palrest.Player) (event.WorldSnapshotData, []Observation) {
	data := event.WorldSnapshotData{
		Source:   event.SourceGameData,
		Players:  []event.SnapshotPlayer{},
		Pals:     []event.SnapshotPal{},
		PalBoxes: []event.SnapshotPalBox{},
		Wild:     []event.SnapshotWild{},
	}
	if clockPattern.MatchString(gameData.InGameTime) {
		data.InGameTime = event.String(gameData.InGameTime)
	}
	if gameData.InGameDays != nil && *gameData.InGameDays >= 0 {
		data.InGameDay = event.Int(*gameData.InGameDays)
	}
	byUser := map[string]palrest.Player{}
	for _, player := range players {
		if validUserID(player.UserID) {
			byUser[player.UserID] = player
		}
	}
	seen := map[string]bool{}
	var observations []Observation
	for _, actor := range gameData.ActorData {
		switch actor.Type {
		case palrest.ActorPalBox:
			class := actor.Class
			if class == "" {
				class = "PalBox"
			}
			data.PalBoxes = append(data.PalBoxes, event.SnapshotPalBox{
				GuildID:   event.String(actor.GuildID),
				GuildName: event.String(actor.GuildName),
				Name:      event.String(actor.Name),
				Class:     class,
				X:         actor.LocationX,
				Y:         actor.LocationY,
				Z:         event.Float(actor.LocationZ),
			})
			continue
		case palrest.ActorCharacter:
		default:
			continue
		}
		switch actor.UnitType {
		case palrest.UnitPlayer:
			if !validUserID(actor.UserID) || seen[actor.UserID] {
				continue
			}
			seen[actor.UserID] = true
			rest, hasRest := byUser[actor.UserID]
			playerID := palrest.InstancePlayerUID(actor.InstanceID)
			loaded := actor.InstanceID != "" && playerID != ""
			name := actor.NickName
			if name == "" && hasRest {
				name = rest.Name
			}
			level := actor.Level
			if !loaded && hasRest && rest.Level > 0 {
				level = rest.Level
			}
			player := event.SnapshotPlayer{
				UserID:     actor.UserID,
				PlayerID:   event.String(playerID),
				Name:       name,
				Level:      nonNegative(level),
				X:          actor.LocationX,
				Y:          actor.LocationY,
				Z:          event.Float(actor.LocationZ),
				GuildID:    event.String(actor.GuildID),
				GuildName:  event.String(actor.GuildName),
				Action:     event.String(actor.Action),
				InstanceID: event.String(actor.InstanceID),
			}
			if loaded {
				player.HP = event.Float(actor.HP)
				player.MaxHP = event.Float(actor.MaxHP)
			}
			if hasRest {
				player.AccountName = event.String(rest.AccountName)
				player.Ping = event.Float(rest.Ping)
			}
			data.Players = append(data.Players, player)
			observations = append(observations, Observation{
				UserID:   actor.UserID,
				PlayerID: playerID,
				Name:     name,
				Level:    actor.Level,
				Loaded:   loaded,
				HasHP:    loaded,
				HP:       actor.HP,
				Action:   actor.Action,
				X:        actor.LocationX,
				Y:        actor.LocationY,
				Z:        event.Float(actor.LocationZ),
			})
		case palrest.UnitOtomoPal, palrest.UnitBaseCampPal:
			if actor.InstanceID == "" || actor.Class == "" {
				continue
			}
			kind := "party"
			if actor.UnitType == palrest.UnitBaseCampPal {
				kind = "base"
			}
			data.Pals = append(data.Pals, event.SnapshotPal{
				InstanceID:      actor.InstanceID,
				Kind:            kind,
				Class:           actor.Class,
				Name:            event.String(actor.NickName),
				Level:           actor.Level,
				HP:              event.Float(actor.HP),
				MaxHP:           event.Float(actor.MaxHP),
				OwnerInstanceID: event.String(actor.TrainerInstanceID),
				OwnerPlayerID:   event.String(palrest.InstancePlayerUID(actor.TrainerInstanceID)),
				OwnerName:       event.String(actor.TrainerNickName),
				GuildID:         event.String(actor.GuildID),
				Action:          event.String(actor.Action),
				AIAction:        event.String(actor.AIAction),
				X:               actor.LocationX,
				Y:               actor.LocationY,
				Z:               event.Float(actor.LocationZ),
			})
		case palrest.UnitWildPal:
			if actor.Class == "" {
				continue
			}
			data.Wild = append(data.Wild, event.SnapshotWild{
				Class: actor.Class,
				Name:  event.String(actor.NickName),
				Level: actor.Level,
				X:     actor.LocationX,
				Y:     actor.LocationY,
			})
		}
	}
	for _, player := range players {
		if !validUserID(player.UserID) || seen[player.UserID] {
			continue
		}
		seen[player.UserID] = true
		playerID := palrest.PlayerUID(player.PlayerID)
		data.Players = append(data.Players, event.SnapshotPlayer{
			UserID:      player.UserID,
			PlayerID:    event.String(playerID),
			Name:        player.Name,
			AccountName: event.String(player.AccountName),
			Level:       nonNegative(player.Level),
			Ping:        event.Float(player.Ping),
			X:           player.LocationX,
			Y:           player.LocationY,
		})
	}
	return data, observations
}

func Fit(data *event.WorldSnapshotData, maxBytes int) error {
	size, err := encodedSize(data)
	if err != nil || size <= maxBytes {
		return err
	}
	if len(data.Wild) > 0 {
		sort.SliceStable(data.Wild, func(i, j int) bool { return data.Wild[i].Level > data.Wild[j].Level })
		for len(data.Wild) > 0 && size > maxBytes {
			keep := len(data.Wild) * maxBytes / size
			if keep >= len(data.Wild) {
				keep = len(data.Wild) - 1
			}
			if keep < 0 {
				keep = 0
			}
			data.WildOmitted += len(data.Wild) - keep
			data.Wild = data.Wild[:keep]
			if size, err = encodedSize(data); err != nil {
				return err
			}
		}
	}
	for len(data.Pals) > 0 && size > maxBytes {
		keep := len(data.Pals) * maxBytes / size
		if keep >= len(data.Pals) {
			keep = len(data.Pals) - 1
		}
		if keep < 0 {
			keep = 0
		}
		data.PalsOmitted += len(data.Pals) - keep
		data.Pals = data.Pals[:keep]
		if size, err = encodedSize(data); err != nil {
			return err
		}
	}
	return nil
}

func encodedSize(data *event.WorldSnapshotData) (int, error) {
	encoded, err := json.Marshal(data)
	if err != nil {
		return 0, err
	}
	return len(encoded), nil
}

func nonNegative(value int) int {
	if value < 0 {
		return 0
	}
	return value
}

func PalBoxSignature(data event.WorldSnapshotData) string {
	parts := make([]string, 0, len(data.PalBoxes))
	for _, box := range data.PalBoxes {
		guild := ""
		if box.GuildID != nil {
			guild = *box.GuildID
		}
		encoded, _ := json.Marshal([]any{guild, box.X, box.Y})
		parts = append(parts, string(encoded))
	}
	sort.Strings(parts)
	encoded, _ := json.Marshal(parts)
	return string(encoded)
}
