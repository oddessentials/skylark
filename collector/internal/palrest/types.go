package palrest

import "strings"

type Info struct {
	Version     string `json:"version"`
	ServerName  string `json:"servername"`
	Description string `json:"description"`
	WorldGUID   string `json:"worldguid"`
}

type Metrics struct {
	CurrentPlayerNum int      `json:"currentplayernum"`
	ServerFPS        float64  `json:"serverfps"`
	ServerFPSAverage *float64 `json:"serverfpsaverage"`
	ServerFrameTime  float64  `json:"serverframetime"`
	Days             int      `json:"days"`
	MaxPlayerNum     int      `json:"maxplayernum"`
	BaseCampNum      int      `json:"basecampnum"`
	Uptime           float64  `json:"uptime"`
}

type Player struct {
	Name        string  `json:"name"`
	AccountName string  `json:"accountName"`
	PlayerID    string  `json:"playerId"`
	UserID      string  `json:"userId"`
	Ping        float64 `json:"ping"`
	LocationX   float64 `json:"location_x"`
	LocationY   float64 `json:"location_y"`
	Level       int     `json:"level"`
}

type GameData struct {
	Time       string  `json:"Time"`
	FPS        float64 `json:"FPS"`
	AverageFPS float64 `json:"AverageFPS"`
	InGameTime string  `json:"InGameTime"`
	InGameDays *int    `json:"InGameDays"`
	ActorData  []Actor `json:"ActorData"`
}

const (
	ActorCharacter = "Character"
	ActorPalBox    = "PalBox"

	UnitPlayer      = "Player"
	UnitOtomoPal    = "OtomoPal"
	UnitBaseCampPal = "BaseCampPal"
	UnitWildPal     = "WildPal"
	UnitNPC         = "NPC"

	ActionDeath = "BP_ActionDeath"
)

type Actor struct {
	Type              string  `json:"Type"`
	InstanceID        string  `json:"InstanceID"`
	UnitType          string  `json:"UnitType"`
	NickName          string  `json:"NickName"`
	Name              string  `json:"Name"`
	TrainerInstanceID string  `json:"TrainerInstanceID"`
	TrainerNickName   string  `json:"TrainerNickName"`
	TrainerClass      string  `json:"TrainerClass"`
	UserID            string  `json:"userid"`
	Level             int     `json:"level"`
	HP                float64 `json:"HP"`
	MaxHP             float64 `json:"MaxHP"`
	GuildID           string  `json:"GuildID"`
	GuildName         string  `json:"GuildName"`
	Class             string  `json:"Class"`
	Action            string  `json:"Action"`
	AIAction          string  `json:"AI_Action"`
	LocationX         float64 `json:"LocationX"`
	LocationY         float64 `json:"LocationY"`
	LocationZ         float64 `json:"LocationZ"`
}

func PlayerUID(value string) string {
	value = strings.TrimSpace(value)
	if !IsPlayerUID(value) || isZero(value) {
		return ""
	}
	return strings.ToUpper(value)
}

func InstancePlayerUID(instanceID string) string {
	owner, _, found := strings.Cut(instanceID, ":")
	if !found {
		return ""
	}
	return PlayerUID(owner)
}

func IsPlayerUID(value string) bool {
	if len(value) != 32 {
		return false
	}
	for i := 0; i < len(value); i++ {
		c := value[i]
		if !(c >= '0' && c <= '9' || c >= 'A' && c <= 'F' || c >= 'a' && c <= 'f') {
			return false
		}
	}
	return true
}

func isZero(value string) bool {
	for i := 0; i < len(value); i++ {
		if value[i] != '0' {
			return false
		}
	}
	return true
}
