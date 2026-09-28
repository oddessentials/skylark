package event

const (
	TypeCollectorStarted   = "collector.started"
	TypeCollectorHeartbeat = "collector.heartbeat"
	TypeServerOnline       = "server.online"
	TypeServerOffline      = "server.offline"
	TypeServerMetrics      = "server.metrics"
	TypeWorldSnapshot      = "world.snapshot"
	TypePlayerConnected    = "player.connected"
	TypePlayerJoined       = "player.joined"
	TypePlayerLeft         = "player.left"
	TypePlayerLevelUp      = "player.level_up"
	TypePlayerDied         = "player.died"
	TypeChatMessage        = "chat.message"
	TypeAdminCommand       = "admin.command"
	TypePlayerKicked       = "player.kicked"
	TypePlayerBanned       = "player.banned"
	TypePlayerUnbanned     = "player.unbanned"
	TypeActionCompleted    = "action.completed"
	TypeActionFailed       = "action.failed"
)

const (
	SourceLog      = "log"
	SourceRest     = "rest"
	SourceSnapshot = "snapshot"
	SourceGameData = "gamedata"
)

const (
	OfflineUnreachable       = "unreachable"
	OfflineShutdown          = "shutdown"
	OfflineCollectorStopping = "collector_stopping"
)

type ServerInfo struct {
	Version     string `json:"version"`
	Name        string `json:"name"`
	Description string `json:"description"`
	WorldGUID   string `json:"world_guid"`
}

type ServerSettings struct {
	DayTimeSpeedRate      float64  `json:"day_time_speed_rate"`
	NightTimeSpeedRate    float64  `json:"night_time_speed_rate"`
	ServerPlayerMaxNum    int      `json:"server_player_max_num"`
	IsPvP                 *bool    `json:"is_pvp,omitempty"`
	IsHardcore            *bool    `json:"is_hardcore,omitempty"`
	ExpRate               *float64 `json:"exp_rate,omitempty"`
	PalCaptureRate        *float64 `json:"pal_capture_rate,omitempty"`
	DeathPenalty          *string  `json:"death_penalty,omitempty"`
	GuildPlayerMaxNum     *int     `json:"guild_player_max_num,omitempty"`
	BaseCampMaxNumInGuild *int     `json:"base_camp_max_num_in_guild,omitempty"`
}

type CollectorLayers struct {
	Rest       bool    `json:"rest"`
	GameData   bool    `json:"gamedata"`
	Logs       bool    `json:"logs"`
	LogsSource *string `json:"logs_source"`
	Saves      bool    `json:"saves"`
	Mod        bool    `json:"mod"`
}

type CollectorStartedData struct {
	CollectorVersion string          `json:"collector_version"`
	OS               string          `json:"os"`
	Arch             string          `json:"arch"`
	Layers           CollectorLayers `json:"layers"`
	Server           *ServerInfo     `json:"server"`
	Settings         *ServerSettings `json:"settings"`
}

type CollectorHeartbeatData struct {
	UptimeS       float64 `json:"uptime_s"`
	QueueDepth    int     `json:"queue_depth"`
	DroppedEvents int64   `json:"dropped_events"`
	Rest          string  `json:"rest"`
	GameData      string  `json:"gamedata"`
	Logs          string  `json:"logs"`
}

type ServerOnlineData struct {
	ServerInfo
	Settings *ServerSettings `json:"settings"`
}

type ServerOfflineData struct {
	Reason string `json:"reason"`
}

type ServerMetricsData struct {
	FPS         float64  `json:"fps"`
	FPSAvg      *float64 `json:"fps_avg"`
	FrameTimeMS float64  `json:"frame_time_ms"`
	Players     int      `json:"players"`
	MaxPlayers  int      `json:"max_players"`
	Days        int      `json:"days"`
	BaseCamps   int      `json:"base_camps"`
	UptimeS     float64  `json:"uptime_s"`
}

type SnapshotPlayer struct {
	UserID      string   `json:"user_id"`
	PlayerID    *string  `json:"player_id"`
	Name        string   `json:"name"`
	AccountName *string  `json:"account_name"`
	Level       int      `json:"level"`
	Ping        *float64 `json:"ping"`
	X           float64  `json:"x"`
	Y           float64  `json:"y"`
	Z           *float64 `json:"z"`
	HP          *float64 `json:"hp"`
	MaxHP       *float64 `json:"max_hp"`
	GuildID     *string  `json:"guild_id"`
	GuildName   *string  `json:"guild_name"`
	Action      *string  `json:"action"`
	InstanceID  *string  `json:"instance_id"`
}

type SnapshotPal struct {
	InstanceID      string   `json:"instance_id"`
	Kind            string   `json:"kind"`
	Class           string   `json:"class"`
	Name            *string  `json:"name"`
	Level           int      `json:"level"`
	HP              *float64 `json:"hp"`
	MaxHP           *float64 `json:"max_hp"`
	OwnerInstanceID *string  `json:"owner_instance_id"`
	OwnerPlayerID   *string  `json:"owner_player_id"`
	OwnerName       *string  `json:"owner_name"`
	GuildID         *string  `json:"guild_id"`
	Action          *string  `json:"action"`
	AIAction        *string  `json:"ai_action"`
	X               float64  `json:"x"`
	Y               float64  `json:"y"`
	Z               *float64 `json:"z"`
}

type SnapshotPalBox struct {
	GuildID   *string  `json:"guild_id"`
	GuildName *string  `json:"guild_name"`
	Name      *string  `json:"name"`
	Class     string   `json:"class"`
	X         float64  `json:"x"`
	Y         float64  `json:"y"`
	Z         *float64 `json:"z"`
}

type SnapshotWild struct {
	Class string  `json:"class"`
	Name  *string `json:"name"`
	Level int     `json:"level"`
	X     float64 `json:"x"`
	Y     float64 `json:"y"`
}

type WorldSnapshotData struct {
	Source      string           `json:"source"`
	InGameTime  *string          `json:"in_game_time"`
	InGameDay   *int             `json:"in_game_day"`
	Players     []SnapshotPlayer `json:"players"`
	Pals        []SnapshotPal    `json:"pals"`
	PalBoxes    []SnapshotPalBox `json:"palboxes"`
	Wild        []SnapshotWild   `json:"wild"`
	WildOmitted int              `json:"wild_omitted,omitempty"`
	PalsOmitted int              `json:"pals_omitted,omitempty"`
}

type PlayerConnectedData struct {
	UserID string  `json:"user_id"`
	Name   string  `json:"name"`
	IP     *string `json:"ip,omitempty"`
}

type PlayerJoinedData struct {
	UserID   string  `json:"user_id"`
	PlayerID *string `json:"player_id"`
	Name     string  `json:"name"`
	Source   string  `json:"source"`
}

type PlayerLeftData struct {
	UserID   string  `json:"user_id"`
	PlayerID *string `json:"player_id"`
	Name     string  `json:"name"`
	Source   string  `json:"source"`
}

type PlayerLevelUpData struct {
	UserID   string  `json:"user_id"`
	PlayerID *string `json:"player_id"`
	Name     string  `json:"name"`
	From     int     `json:"from"`
	To       int     `json:"to"`
}

type PlayerDiedData struct {
	UserID   string   `json:"user_id"`
	PlayerID *string  `json:"player_id"`
	Name     string   `json:"name"`
	X        float64  `json:"x"`
	Y        float64  `json:"y"`
	Z        *float64 `json:"z"`
	Source   string   `json:"source"`
	Cause    *string  `json:"cause"`
	Killer   *string  `json:"killer"`
}

type ChatMessageData struct {
	UserID    string  `json:"user_id"`
	Name      string  `json:"name"`
	Channel   string  `json:"channel"`
	Text      string  `json:"text"`
	GuildName *string `json:"guild_name"`
}

type AdminCommandData struct {
	Actor   string   `json:"actor"`
	UserID  *string  `json:"user_id"`
	Details []string `json:"details"`
}

type ModerationData struct {
	UserID   string  `json:"user_id"`
	PlayerID *string `json:"player_id"`
	By       string  `json:"by"`
	Message  *string `json:"message"`
}

type ActionCompletedData struct {
	ActionID int64  `json:"action_id"`
	Kind     string `json:"kind"`
}

type ActionFailedData struct {
	ActionID int64  `json:"action_id"`
	Kind     string `json:"kind"`
	Error    string `json:"error"`
}

func String(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func Float(value float64) *float64 {
	return &value
}

func Int(value int) *int {
	return &value
}

func Bool(value bool) *bool {
	return &value
}
