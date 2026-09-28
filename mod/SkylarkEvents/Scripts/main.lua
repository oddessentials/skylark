local VERSION = 1
local MAX_BYTES = 8 * 1024 * 1024
local KNOCKOUT_WINDOW = 60
local CAPTURE_WINDOW = 30
local DEBUG = (os.getenv("SKYLARK_EVENTS_DEBUG") or "") ~= ""

local DEAD_TYPES = {
    [0] = "undefined",
    [1] = "attack",
    [2] = "self_destruction",
    [3] = "body_temperature",
    [4] = "falling",
    [5] = "poison",
    [6] = "burn",
    [7] = "drown",
    [8] = "tower_boss_battle",
    [9] = "ground",
    [10] = "suicide",
}

local BOSS_TYPES = {
    [1] = "GrassBoss",
    [2] = "ElectricBoss",
    [3] = "ForestBoss",
    [4] = "SnowBoss",
    [5] = "DesertBoss",
    [6] = "SakurajimaBoss",
    [7] = "VikingBoss",
    [8] = "SorajimaBoss",
    [9] = "KingWhaleBoss",
    [10] = "WorldTreeMiddleBoss1",
    [11] = "WorldTreeMiddleBoss2",
    [12] = "WorldTreeMiddleBoss3",
    [13] = "WorldTreeBoss",
}

local DIFFICULTIES = {
    [1] = "normal",
    [2] = "hard",
}

local RAID_SUCCESS = 0

local PLAYER_STATE = "/Script/Pal.PalPlayerState"
local PLAYER_CHARACTER = "/Script/Pal.PalPlayerCharacter"
local PLAYER_CONTROLLER = "/Script/Pal.PalPlayerController"
local CHARACTER = "/Script/Pal.PalCharacter"
local UTILITY = "/Script/Pal.Default__PalUtility"

local function here()
    local ok, source = pcall(function()
        return debug.getinfo(1, "S").source
    end)
    if not ok or type(source) ~= "string" then
        return "Mods/SkylarkEvents"
    end
    source = source:gsub("^@", ""):gsub("\\", "/")
    return source:match("^(.*)/Scripts/[^/]+$") or source:match("^(.*)/[^/]+$") or "Mods/SkylarkEvents"
end

local EVENTS = (os.getenv("SKYLARK_EVENTS_FILE") or (here():match("^(.*)/[^/]+$") or ".") .. "/skylark-events.jsonl")

local function escape(text)
    return (text:gsub('[%c"\\]', function(c)
        local named = { ['"'] = '\\"', ["\\"] = "\\\\", ["\n"] = "\\n", ["\r"] = "\\r", ["\t"] = "\\t" }
        return named[c] or string.format("\\u%04x", c:byte())
    end))
end

local function encode(value)
    local kind = type(value)
    if kind == "table" then
        local keys = {}
        for key in pairs(value) do
            keys[#keys + 1] = key
        end
        table.sort(keys)
        local parts = {}
        for _, key in ipairs(keys) do
            parts[#parts + 1] = '"' .. escape(tostring(key)) .. '":' .. encode(value[key])
        end
        return "{" .. table.concat(parts, ",") .. "}"
    elseif kind == "string" then
        return '"' .. escape(value) .. '"'
    elseif kind == "number" then
        if value == math.floor(value) then
            return string.format("%d", value)
        end
        return string.format("%.2f", value)
    elseif kind == "boolean" then
        return tostring(value)
    end
    return "null"
end

local function rotate()
    local file = io.open(EVENTS, "r")
    if not file then
        return
    end
    local size = file:seek("end")
    file:close()
    if size and size > MAX_BYTES then
        os.remove(EVENTS .. ".1")
        os.rename(EVENTS, EVENTS .. ".1")
    end
end

local function emit(kind, fields)
    fields.v = VERSION
    fields.type = kind
    fields.ts = os.date("!%Y-%m-%dT%H:%M:%SZ")
    rotate()
    local file = io.open(EVENTS, "a")
    if file then
        file:write(encode(fields), "\n")
        file:close()
    end
    print("[SkylarkEvents] " .. encode(fields) .. "\n")
end

local function note(message)
    if DEBUG then
        print("[SkylarkEvents] " .. message .. "\n")
    end
end

local function valid(object)
    return object ~= nil and type(object) == "userdata" and object.IsValid ~= nil and object:IsValid()
end

local function try(fn)
    local ok, value = pcall(fn)
    if ok then
        return value
    end
    return nil
end

local function text(value)
    if value == nil then
        return nil
    end
    local result = try(function()
        return value:ToString()
    end)
    if result == nil or result == "" or result == "None" then
        return nil
    end
    return result
end

local function guid(value)
    return try(function()
        local parts = {}
        for _, field in ipairs({ "A", "B", "C", "D" }) do
            parts[#parts + 1] = string.format("%08X", math.tointeger(value[field]) & 0xFFFFFFFF)
        end
        local id = table.concat(parts)
        if id == "00000000000000000000000000000000" then
            return nil
        end
        return id
    end)
end

local function merge(target, source, prefix)
    if source then
        for key, value in pairs(source) do
            target[(prefix or "") .. key] = value
        end
    end
    return target
end

local found = {}

local function object_at(path)
    local object = found[path]
    if not valid(object) then
        object = StaticFindObject(path)
        if not valid(object) then
            return nil
        end
        found[path] = object
    end
    return object
end

local function is(object, path)
    local class = object_at(path)
    return class ~= nil and try(function()
        return object:IsA(class)
    end) == true
end

local function address(object)
    return tostring(try(function()
        return object:GetAddress()
    end))
end

local function class_name(object)
    return text(try(function()
        return object:GetClass():GetFName()
    end)) or "nothing"
end

local function describe(state)
    if not valid(state) then
        return nil
    end
    local id = guid(try(function()
        return state.PlayerUId
    end))
    if not id then
        return nil
    end
    return {
        player_id = id,
        name = text(try(function()
            return state:GetPlayerName()
        end)),
    }
end

local function state_of(actor)
    local state = try(function()
        return actor.PlayerState
    end)
    if valid(state) then
        return state
    end
    return nil
end

local function player_of(character)
    if not valid(character) or not is(character, PLAYER_CHARACTER) then
        return nil
    end
    return describe(state_of(character))
end

local function owning_state(object)
    for _ = 1, 4 do
        if not valid(object) then
            return nil
        end
        if is(object, PLAYER_STATE) then
            return object
        end
        if is(object, PLAYER_CHARACTER) or is(object, PLAYER_CONTROLLER) then
            return state_of(object)
        end
        object = try(function()
            return object:GetOwner()
        end)
    end
    return nil
end

local function player_states()
    local states = {}
    for _, state in ipairs(FindAllOf("PalPlayerState") or {}) do
        if valid(state) then
            states[#states + 1] = state
        end
    end
    return states
end

local function player_by_uid(id)
    if not id then
        return nil
    end
    for _, state in ipairs(player_states()) do
        local player = describe(state)
        if player and player.player_id == id then
            return player
        end
    end
    return { player_id = id }
end

local function player_by_session_id(id)
    for _, state in ipairs(player_states()) do
        if try(function()
            return state.PlayerId
        end) == id then
            return describe(state)
        end
    end
    return nil
end

local function connected(player_id)
    if not player_id then
        return false
    end
    for _, character in ipairs(FindAllOf("PalPlayerCharacter") or {}) do
        local player = player_of(character)
        if player and player.player_id == player_id then
            return true
        end
    end
    return false
end

local function pal_from_save(save)
    local species = text(try(function()
        return save.CharacterID
    end))
    if not species then
        return nil
    end
    return {
        species = species,
        level = try(function()
            return math.tointeger(save.Level)
        end),
        owner_id = guid(try(function()
            return save.OwnerPlayerUId
        end)),
    }
end

local function pal_from(parameter)
    if not valid(parameter) then
        return nil
    end
    return pal_from_save(try(function()
        return parameter.SaveParameter
    end))
end

local function pal_of(character)
    if not valid(character) then
        return nil
    end
    return pal_from(try(function()
        return character.CharacterParameterComponent.IndividualParameter
    end))
end

local function killer_pal(pal)
    if not pal then
        return nil
    end
    return { species = pal.species, level = pal.level }
end

local function attacker_of(actor)
    for _ = 1, 3 do
        if not valid(actor) then
            return nil
        end
        if is(actor, PLAYER_CHARACTER) then
            return player_of(actor)
        end
        if is(actor, CHARACTER) then
            return killer_pal(pal_of(actor))
        end
        actor = try(function()
            return actor:GetOwner()
        end)
    end
    return nil
end

local function copy_guid(value)
    return { A = value.A, B = value.B, C = value.C, D = value.D }
end

local function attacker_by_instance(context, instance)
    if instance == nil then
        return nil
    end
    local player_id = guid(try(function()
        return instance.PlayerUId
    end))
    if player_id then
        return player_by_uid(player_id)
    end
    local utility = object_at(UTILITY)
    if not utility then
        return nil
    end
    local parameter = try(function()
        return utility:GetIndividualCharacterParameterByIstanceID(context, instance)
    end)
    if not valid(parameter) then
        parameter = try(function()
            return utility:GetIndividualCharacterParameterByIstanceID(context, {
                PlayerUId = copy_guid(instance.PlayerUId),
                InstanceId = copy_guid(instance.InstanceId),
                DebugName = "",
            })
        end)
    end
    return killer_pal(pal_from(parameter))
end

local warned = {}

local function guard(path, callback)
    return function(...)
        local done, failure = pcall(callback, ...)
        if not done and not warned[path] then
            warned[path] = true
            print("[SkylarkEvents] " .. path .. " failed: " .. tostring(failure) .. "\n")
        end
    end
end

local function hook(path, callback, after)
    local ok, err
    if after then
        ok, err = pcall(RegisterHook, path, guard(path, callback), guard(path, after))
    else
        ok, err = pcall(RegisterHook, path, guard(path, callback))
    end
    print("[SkylarkEvents] " .. path .. (ok and " hooked" or (" unavailable: " .. tostring(err))) .. "\n")
end

local knocked = {}

local function knockout(player, cause, killer, source)
    if not player then
        return
    end
    local now = os.time()
    local last = knocked[player.player_id]
    if last and now - last < KNOCKOUT_WINDOW then
        note(source .. " repeated a knockout already written")
        return
    end
    knocked[player.player_id] = now
    local fields = merge({ cause = cause }, player)
    merge(fields, killer, "killer_")
    emit("knockout", fields)
end

hook("/Script/Pal.PalEventNotify_Character:OnCharacterDead_ServerInternal", function(_, info)
    local dead = info:get()
    local player = player_of(try(function()
        return dead.SelfActor
    end))
    if not player then
        return
    end
    local attacker = try(function()
        return dead.LastAttacker
    end)
    local killer = attacker_of(attacker)
    note("character dead: attacker " .. class_name(attacker) .. ", killer " .. encode(killer or {}))
    knockout(player, DEAD_TYPES[try(function()
        return math.tointeger(dead.DeadType)
    end)], killer, "character dead")
end)

hook("/Script/Pal.PalBattleManager:EventOnPlayerDeadCompletely", function(_, character, info)
    local victim = character:get()
    local ending = info:get()
    local killer = attacker_by_instance(victim, try(function()
        return ending.LastAttackerInstanceID
    end))
    note("player dead completely: killer " .. encode(killer or {}))
    knockout(player_of(victim), DEAD_TYPES[try(function()
        return math.tointeger(ending.DeadType)
    end)], killer, "player dead completely")
end)

local attempts = {}

local function forget_old_attempts(now)
    for key, attempt in pairs(attempts) do
        if now - attempt.at > CAPTURE_WINDOW then
            attempts[key] = nil
        end
    end
end

local function attempt_for(key, now)
    local attempt = key and attempts[key]
    if attempt then
        attempts[key] = nil
        return attempt, "instance"
    end
    local latest, latest_key = nil, nil
    for other, candidate in pairs(attempts) do
        if now - candidate.at <= CAPTURE_WINDOW and (not latest or candidate.at > latest.at) then
            latest, latest_key = candidate, other
        end
    end
    if latest then
        attempts[latest_key] = nil
        return latest, "time"
    end
    return nil, nil
end

hook("/Script/Pal.PalCharacterParameterComponent:SetIsCapturedProcessing", function(component, processing)
    if processing:get() ~= true then
        return
    end
    local parameters = component:get()
    local pal = pal_from(try(function()
        return parameters.IndividualParameter
    end))
    if not pal then
        return
    end
    local now = os.time()
    forget_old_attempts(now)
    local key = guid(try(function()
        return parameters.IndividualParameter.IndividualId.InstanceId
    end)) or ("pal " .. address(parameters))
    attempts[key] = { species = pal.species, level = pal.level, at = now }
    note("capture attempt on " .. pal.species .. " " .. key)
end)

hook("/Script/Pal.PalNetworkIndividualComponent:BroadcastChangeOwnerCharacter_ToAll", function(_, id, owner)
    local instance = id:get()
    local key = guid(try(function()
        return instance.InstanceId
    end))
    local attempt, matched = attempt_for(key, os.time())
    note("owner change for " .. tostring(key) .. ", attempt matched by " .. tostring(matched))
    if not attempt then
        return
    end
    local player = player_by_uid(guid(owner:get()))
    if not player then
        return
    end
    emit("capture", merge({ species = attempt.species, level = attempt.level }, player))
end)

hook("/Script/Pal.PalMapObjectHatchingEggModel:ObtainHatchedCharacter_ServerInternal", function(model, requester)
    local pal = pal_from_save(try(function()
        return model:get().HatchedCharacterSaveParameter
    end))
    if not pal then
        note("hatch without a species")
        return
    end
    emit("hatch", merge({ species = pal.species, level = pal.level }, player_by_session_id(requester:get())))
end)

local function unlocked(state, technology)
    local names = try(function()
        return state.TechnologyData.UnlockedTechnologyNameArray
    end)
    local count = try(function()
        return #names
    end) or 0
    for index = 1, count do
        local name = try(function()
            return names[index]
        end)
        if (text(name) or text(try(function()
            return name:get()
        end))) == technology then
            return true
        end
    end
    return false
end

local requested = {}

local function technology_request(component, name)
    return text(name:get()), owning_state(component:get())
end

hook("/Script/Pal.PalNetworkPlayerComponent:RequestUnlockTechnology_ToServer", function(component, name)
    local technology, state = technology_request(component, name)
    if not technology or not state then
        note("technology request without a player")
        return
    end
    local before = unlocked(state, technology)
    note("technology " .. technology .. " requested, unlocked before: " .. tostring(before))
    requested[technology] = not before
end, function(component, name)
    local technology, state = technology_request(component, name)
    if not technology or not state then
        return
    end
    local after = unlocked(state, technology)
    note("technology " .. technology .. " unlocked after: " .. tostring(after))
    if requested[technology] and after then
        emit("technology", merge({ technology = technology }, describe(state)))
    end
    requested[technology] = nil
end)

hook("/Script/Pal.PalBossTower:WriteBossDefeatRecord_ServerInternal", function(tower, target)
    local building = tower:get()
    local boss = BOSS_TYPES[try(function()
        return math.tointeger(building.BossType)
    end)]
    local player = player_of(target:get())
    if not boss or not player then
        note("tower record without a boss or a player")
        return
    end
    emit("boss", merge({
        boss = boss,
        kind = "tower",
        difficulty = DIFFICULTIES[try(function()
            return math.tointeger(building.InstanceModel.Difficulty)
        end)],
    }, player))
end)

local raids = {}

local function raid_species(raid)
    local list = try(function()
        return raid.DeadRaidBossPalList
    end)
    local count = try(function()
        return #list
    end) or 0
    for index = 1, count do
        local pal = pal_from(try(function()
            return list[index]:TryGetIndividualParameter()
        end))
        if pal then
            return pal.species
        end
    end
    return nil
end

hook("/Script/Pal.PalRaidBossComponent:OnSpawnBossPal", function(component, spawned)
    local pal = pal_of(spawned:get())
    if pal then
        raids[address(component:get())] = pal.species
    end
end)

hook("/Script/Pal.PalRaidBossComponent:CallOnEnd_ToAll", function(component, finish)
    local raid = component:get()
    local key = address(raid)
    local species = raids[key] or raid_species(raid)
    raids[key] = nil
    local outcome = try(function()
        return math.tointeger(finish:get())
    end)
    note("raid ended: " .. tostring(outcome) .. ", boss " .. tostring(species))
    if outcome ~= RAID_SUCCESS then
        return
    end
    local summon = text(try(function()
        return raid.StartItemName
    end))
    local player = player_by_uid(guid(try(function()
        return raid.StartRequestPlayerUID
    end)))
    if not (summon or species) or not player then
        note("raid clear without a boss or a player")
        return
    end
    emit("boss", merge({ boss = summon or species, species = species, kind = "raid" }, player))
end)

hook("/Script/Pal.PalPlayerRecordData:OnCompleteBuild_ServerInternal", function(record, model)
    local structure = text(try(function()
        return model:get().MapObjectMasterDataId
    end))
    if not structure then
        return
    end
    local player = describe(try(function()
        return record:get():GetOuter()
    end))
    if not player or not connected(player.player_id) then
        return
    end
    emit("build", merge({ structure = structure }, player))
end)

print("[SkylarkEvents] writing to " .. EVENTS .. (DEBUG and ", with notes" or "") .. "\n")
