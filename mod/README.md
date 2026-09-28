# Skylark Events

An optional [UE4SS](https://github.com/UE4SS-RE/RE-UE4SS) Lua mod for Palworld dedicated servers on Windows. It notices what the server's REST API, world snapshot and log never report, and writes each one as a JSON line for the [Skylark](../README.md) collector:

| `type` | When | Fields |
| --- | --- | --- |
| `knockout` | A player is knocked out | `cause` (`attack`, `falling`, `drown`, `burn`, `poison`, `body_temperature`, `tower_boss_battle` and a few rarer ones), and for an attack the killer: `killer_player_id` and `killer_name` for another player, or `killer_species` and `killer_level` for a Pal or a human |
| `capture` | A player catches a Pal | `species`, `level` |
| `hatch` | A player takes a Pal from an incubator | `species`, `level` |
| `boss` | A player beats a tower boss, or wins a raid they summoned | `kind` (`tower` or `raid`), `boss` (the tower's boss type or the raid's summon id), `difficulty` (`normal` or `hard`) for towers, `species` for raids |
| `technology` | A player unlocks a technology | `technology` |
| `build` | A player finishes building a structure | `structure` |

Every line also has `v` (1), `type`, `ts` (UTC), `player_id` (the player's `PlayerUId`, as REST prints it) and usually `name`. Species, technologies and structures are the game's own ids, such as `SheepBall`, `RepairBench` or `BOSS_GrassMammoth`; the site turns them into names.

Nothing changes for players, who need no mods. The file stays on the server and the collector sends the events to your site only. The site lists catches, hatches, boss clears and unlocks in the activity feed, says who or what knocked a player out, and counts all six on player pages.

## Install

The mod needs UE4SS on the server. It was built against RE-UE4SS `experimental` 3.0.1-1150 on Palworld 1.0.5.102999, where a player on a test server saw technology unlocks, builds, captures and knockouts (by drowning, an alpha Pal and a wild Pal) arrive with the right player and details. Hatching and tower and raid clears use the same lookups but have not been seen live yet.

**UE4SS installed by hand.** Copy the `SkylarkEvents` folder into the server's `Pal/Binaries/Win64/ue4ss/Mods` folder and restart the server. The folder carries `enabled.txt`, which switches it on.

**The official mod loader.** Unpack `skylark-mod.zip` from a [release](https://github.com/oddessentials/skylark/releases) into the folder `WorkshopRootDir` names in the server's `Mods/PalModSettings.ini`, next to the UE4SS package, and list both:

```ini
[PalModSettings]
bGlobalEnableMod=True
WorkshopRootDir=C:\palworld-server\workshop
ActiveModList=UE4SS
ActiveModList=SkylarkEvents
```

The loader installs the scripts into `Mods/NativeMods/UE4SS/Mods/SkylarkEvents` when the server starts, and again whenever the package's `Version` changes.

## The events file

The mod writes `skylark-events.jsonl` in the UE4SS `Mods` folder, beside its own folder, so a reinstall keeps it. At 8 MB it becomes `skylark-events.jsonl.1`, replacing the one before. The environment variable `SKYLARK_EVENTS_FILE` names another path, and `SKYLARK_EVENTS_DEBUG=1` adds notes to `UE4SS.log` about what each hook saw and why it wrote nothing.

The collector finds the file by itself when `palworld.server_dir` or `launch.command` point at the server; otherwise set `mod.events` (or `SKYLARK_MOD_EVENTS`) to its path. It starts at the end of a file that already exists, reads a new file from its first line, and remembers its place across restarts.

## How it works

The mod hooks functions the game runs on the server, found in the dedicated server's reflection data. Each hook reads what the game passes it and writes a line only for a player who is online.

| Event | Hook |
| --- | --- |
| knockout | `PalBattleManager:EventOnPlayerDeadCompletely`, and `PalEventNotify_Character:OnCharacterDead_ServerInternal` |
| capture | `PalCharacterParameterComponent:SetIsCapturedProcessing` marks the throw, and `PalNetworkIndividualComponent:BroadcastChangeOwnerCharacter_ToAll` for the same Pal within 30 s makes it a catch |
| hatch | `PalMapObjectHatchingEggModel:ObtainHatchedCharacter_ServerInternal` |
| tower boss | `PalBossTower:WriteBossDefeatRecord_ServerInternal` |
| raid | `PalRaidBossComponent:OnSpawnBossPal` and `CallOnEnd_ToAll` |
| technology | `PalNetworkPlayerComponent:RequestUnlockTechnology_ToServer`, written after the call only when the technology is unlocked |
| build | `PalPlayerRecordData:OnCompleteBuild_ServerInternal` |

A knockout's killer comes from the attacker's instance id, looked up with `PalUtility:GetIndividualCharacterParameterByIstanceID`. A player's second knockout report within a minute is dropped, and the site merges the mod's knockout with the one it sees in the world snapshot.
