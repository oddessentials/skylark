package world

import (
	"sort"

	"github.com/oddessentials/skylark/collector/internal/palrest"
)

type ChangeKind string

const (
	Joined  ChangeKind = "joined"
	Left    ChangeKind = "left"
	LevelUp ChangeKind = "level_up"
	Died    ChangeKind = "died"
)

type Change struct {
	Kind     ChangeKind
	UserID   string
	PlayerID string
	Name     string
	From     int
	To       int
	X        float64
	Y        float64
	Z        *float64
}

type playerState struct {
	userID     string
	playerID   string
	name       string
	online     bool
	missing    int
	presence   ChangeKind
	level      int
	levelKnown bool
	dead       bool
}

type Tracker struct {
	players    map[string]*playerState
	baselined  bool
	missesToGo int
}

func NewTracker() *Tracker {
	return &Tracker{players: map[string]*playerState{}, missesToGo: 2}
}

func (t *Tracker) state(userID string) *playerState {
	st, ok := t.players[userID]
	if !ok {
		st = &playerState{userID: userID}
		t.players[userID] = st
	}
	return st
}

func (t *Tracker) remember(st *playerState, playerID, name string) {
	if playerID != "" {
		st.playerID = playerID
	}
	if name != "" {
		st.name = name
	}
}

func (t *Tracker) Reset() {
	t.players = map[string]*playerState{}
	t.baselined = false
}

func (t *Tracker) PlayerID(userID string) string {
	if st, ok := t.players[userID]; ok {
		return st.playerID
	}
	return ""
}

func (t *Tracker) Name(userID string) string {
	if st, ok := t.players[userID]; ok {
		return st.name
	}
	return ""
}

func (t *Tracker) Presence(observations []Observation, emit bool) []Change {
	var changes []Change
	present := map[string]bool{}
	baseline := !t.baselined
	t.baselined = true
	for _, obs := range observations {
		if obs.UserID == "" {
			continue
		}
		present[obs.UserID] = true
		st := t.state(obs.UserID)
		t.remember(st, obs.PlayerID, obs.Name)
		st.missing = 0
		if !st.online {
			st.online = true
			if !baseline && emit && st.presence != Joined {
				st.presence = Joined
				changes = append(changes, Change{Kind: Joined, UserID: st.userID, PlayerID: obs.PlayerID, Name: st.name})
			}
		}
		if change := t.observeLevel(st, obs); change != nil {
			changes = append(changes, *change)
		}
	}
	users := make([]string, 0, len(t.players))
	for userID := range t.players {
		users = append(users, userID)
	}
	sort.Strings(users)
	for _, userID := range users {
		st := t.players[userID]
		if !st.online || present[userID] {
			continue
		}
		st.missing++
		if st.missing < t.missesToGo {
			continue
		}
		st.online = false
		st.levelKnown = false
		st.dead = false
		if emit && st.presence != Left {
			st.presence = Left
			changes = append(changes, Change{Kind: Left, UserID: st.userID, PlayerID: st.playerID, Name: st.name})
		}
	}
	return changes
}

func (t *Tracker) LogJoin(userID, playerID, name string) bool {
	st := t.state(userID)
	t.remember(st, palrest.PlayerUID(playerID), name)
	st.online = true
	st.missing = 0
	if st.presence == Joined {
		return false
	}
	st.presence = Joined
	return true
}

func (t *Tracker) LogLeft(userID, name string) (bool, string) {
	st := t.state(userID)
	t.remember(st, "", name)
	st.online = false
	st.missing = 0
	st.levelKnown = false
	st.dead = false
	if st.presence == Left {
		return false, st.playerID
	}
	st.presence = Left
	return true, st.playerID
}

func (t *Tracker) Snapshot(observations []Observation) []Change {
	var changes []Change
	for _, obs := range observations {
		if obs.UserID == "" {
			continue
		}
		st := t.state(obs.UserID)
		t.remember(st, obs.PlayerID, obs.Name)
		if change := t.observeLevel(st, obs); change != nil {
			changes = append(changes, *change)
		}
		if !obs.Loaded || !obs.HasHP {
			continue
		}
		if obs.HP > 0 {
			st.dead = false
			continue
		}
		if obs.Action == palrest.ActionDeath && !st.dead {
			st.dead = true
			changes = append(changes, Change{
				Kind:     Died,
				UserID:   st.userID,
				PlayerID: st.playerID,
				Name:     st.name,
				X:        obs.X,
				Y:        obs.Y,
				Z:        obs.Z,
			})
		}
	}
	return changes
}

func (t *Tracker) observeLevel(st *playerState, obs Observation) *Change {
	if !obs.Loaded || obs.Level <= 0 {
		return nil
	}
	if !st.levelKnown {
		st.level = obs.Level
		st.levelKnown = true
		return nil
	}
	if obs.Level <= st.level {
		return nil
	}
	from := st.level
	st.level = obs.Level
	return &Change{Kind: LevelUp, UserID: st.userID, PlayerID: st.playerID, Name: st.name, From: from, To: obs.Level}
}
