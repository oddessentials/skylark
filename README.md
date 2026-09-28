<p align="center">
  <img src="site/assets/banner.jpg" alt="Skylark: a live website for your Palworld server" width="100%">
</p>

<p align="center">
  <a href="#install"><b>Install</b></a> &nbsp;·&nbsp;
  <a href="#collector-reference"><b>Collector</b></a> &nbsp;·&nbsp;
  <a href="web/openapi.yaml"><b>API</b></a> &nbsp;·&nbsp;
  <a href="LICENSE"><b>MIT licence</b></a>
</p>

Skylark gives your Palworld dedicated server its own website. A small collector runs beside the server and reports who is online, where they roam and what happens in the world, and the site shows it live and keeps the history. Players install nothing, and the server needs no mods.

<p align="center">
  <img src="site/assets/today.jpg" alt="The Skylark front page: who is out in the world, the sun dial and the live map" width="100%">
</p>

## Only in Skylark

<table>
  <tr>
    <td width="34%" valign="top">
      <img src="site/assets/sun-dial.jpg" alt="The sun dial">
      <h3>Sun dial</h3>
      The in-game day and hour on a capture-sphere dial, live from the server's own clock. It counts down to nightfall and dawn at the hours the game really uses, and runs at the server's day and night speeds.
    </td>
    <td width="66%" valign="top">
      <img src="site/assets/map.jpg" alt="The live map">
      <h3>The islands, live</h3>
      An original map drawn from the game's own region data, with the Great Eagle Statues and towers. Players move on it as they play, next to the bases, the wild Pals around them and the day's knockouts.
    </td>
  </tr>
</table>

<img src="site/assets/player.jpg" alt="A player page with the Pals out with them, their level over time and the trail of their session" width="100%">

### Player pages

Playtime, sessions, level history, knockouts and distance travelled for everyone who plays, with the Pals out with them right now and the trail of each session on the map.

## Also on the site

- Who is online, with their level, health, guild and Pals, and everything that happened today
- Guilds with their members and bases, chat, and a live activity feed
- The world's settings, the server's history and this week's leaders
- An admin area for the collector, server actions (announce, save, shut down with a countdown, kick, ban), backups and a history rebuild
- Switches to hide positions, bases, Pals, chat or guild chat

## Install

1. Run the site with Docker Compose on a machine the collector can reach:

   ```sh
   git clone https://github.com/oddessentials/skylark.git && cd skylark
   cp .env.example .env
   docker compose --profile site up -d --build
   ```

2. Open `/admin` on port 3000, set the password, and copy the collector secret from the Collector page.
3. Download the collector for your platform from a [release](https://github.com/oddessentials/skylark/releases) or pull `ghcr.io/oddessentials/skylark-collector`, or build it with `npm run collector:build` (Go 1.27). Run it beside the Palworld server with that secret and the server's admin password. On Windows it starts the server itself; on Linux it follows the server's Docker container or console output.

The server needs its REST API on (`RESTAPIEnabled=True` and an `AdminPassword`), the launch argument `-enable-gamedata-api` for positions, Pals and bases, and `LogFormatType=Json` for joins and chat as they happen. The collector sends only to your site, and the site never shows IP addresses or platform ids publicly.

<details>
<summary><b>Site settings</b></summary>

The site is a SvelteKit app on Node 24 with PostgreSQL 18. It migrates the database when it starts.

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | | PostgreSQL connection string. |
| `COLLECTOR_SECRET` | generated | The secret the collector signs its batches with. When unset the site generates one and shows it on the admin Collector page. |
| `ADMIN_PASSWORD` | | The admin password. When unset the first visitor to `/admin` sets it. |
| `ADMIN_SESSION_SECRET` | generated | Signs admin sessions. |
| `PUBLIC_SITE_NAME` | `Palworld server` | The site name; also settable on the admin Settings page. |
| `ORIGIN` | | The address people use, for example `https://skylark.example.com`. Admin changes must come from it. |
| `BACKUP_DIR`, `BACKUPS_KEPT` | `/backups`, `14` | Nightly `pg_dump` backups. |
| `API_MOCK` | `0` | `1` serves the recorded fixtures instead of a database, for trying the pages. |

The API is described in `web/openapi.yaml` and served at `/api/v1/openapi.json`. `/api/v1/stream` sends live updates as server-sent events.

</details>

<details id="collector-reference">
<summary><b>Collector reference</b></summary>

The collector is one binary for Windows x64, Linux x64 and Linux arm64. It reads the server's REST API, world snapshot and console log, turns what it sees into events and posts them in signed batches to your site.

What it needs from the server:

- The REST API: `RESTAPIEnabled=True` and an `AdminPassword` in `PalWorldSettings.ini`, or the launch arguments `-restapi -restapiport=8212 -adminpassword=...`. Keep that port on the local network: only the collector talks to it.
- For Pals, bases, knockouts and the in-game clock: the launch argument `-enable-gamedata-api`. Without it the collector still reports the players from `/players`.
- For joins, leaves and chat as they happen: `LogFormatType=Json` (or `-logformat=json`) and a log source. Without one, joins and leaves come from polling `/players`.

| `logs.source` | How the collector reads the server's console |
| --- | --- |
| `launch` | Starts the server itself. On Windows it runs the server under a pseudo console, which hands over every line at once, where a plain pipe holds lines back for a minute or more. Ctrl+C or a service stop asks the server to save and shut down through REST and waits for it. `-logformat=json` and `-enable-gamedata-api` are added when missing. `launch.command` can be `PalServer.exe`, `PalServer-Win64-Shipping-Cmd.exe` or `PalServer.sh`. |
| `docker` | Follows a container's log through the Docker Engine API (`/var/run/docker.sock`, the Windows named pipe or `docker.host`). It remembers where it stopped, so a restart neither repeats nor loses lines. |
| `file` | Follows a file the server's output is written to, through rotation and truncation. |
| `stdin` | Reads the server's output from a pipe, for example `./PalServer.sh -logformat=json \| SKYLARK_LOGS_SOURCE=stdin ./skylark-collector-linux-amd64`. The collector stops when the server does. |
| `none` | REST only. |

The collector reads `skylark-collector.toml` beside the binary, or the file given with `--config`. Every key can also be set with an environment variable named `SKYLARK_` plus the section and key in capitals, such as `SKYLARK_SITE_SECRET`, `SKYLARK_PALWORLD_ADMIN_PASSWORD` or `SKYLARK_INTERVALS_PLAYERS`; `SKYLARK_LAUNCH_ARGS` takes a JSON array or space-separated arguments.

```toml
[site]
url = "https://skylark.example.com"
secret = "the collector secret from the site"

[palworld]
server_dir = "C:/palworld-server"

[logs]
source = "launch"

[launch]
command = "C:/palworld-server/PalServer.exe"
args = ["-port=8211", "-publiclobby"]
```

| Key | Default | Meaning |
| --- | --- | --- |
| `site.url`, `site.secret` | | The Skylark site and its collector secret. Batches go to `/api/ingest`. |
| `palworld.rest_url` | `http://127.0.0.1:8212` | The server's REST API. |
| `palworld.admin_password` | | The server's `AdminPassword`. |
| `palworld.server_dir` | | The server's install folder. The collector reads `AdminPassword`, `RESTAPIPort`, `RESTAPIEnabled` and `LogFormatType` from its `PalWorldSettings.ini`, or from the `-UserDir` world in `launch.args`. |
| `logs.source` | `launch` when `launch.command` is set, else `none` | See above. |
| `logs.timezone` | `Local`, `UTC` for `docker` | The time zone of the server's log timestamps. |
| `launch.command`, `launch.args`, `launch.work_dir` | | The server to start. |
| `launch.shutdown_wait`, `launch.shutdown_message` | `5s`, `The server is shutting down.` | The warning players get when the collector stops the server. |
| `launch.enable_gamedata` | `true` | Add `-enable-gamedata-api` when it is missing. |
| `docker.container`, `docker.host` | | The container to follow and the Docker endpoint. |
| `file.path` | | The file to follow. |
| `intervals.players`, `snapshot`, `snapshot_idle`, `metrics`, `heartbeat`, `flush` | `5s`, `10s`, `60s`, `30s`, `60s`, `2s` | Polling and sending periods. With nobody online a world snapshot goes out every `snapshot_idle`. |
| `send_ips` | `false` | Send players' IP addresses with `player.connected`. |
| `journal_dir` | `skylark-journal` beside the config file | Where events wait until the site confirms them. |

`skylark-collector check` tests the REST API, the game data, the log source and the site, and `--dry-run` prints the batches instead of sending them.

To run the collector in Docker on the network of the server's container:

```sh
docker run -d --name skylark-collector --network palworld \
  -v /var/run/docker.sock:/var/run/docker.sock -v skylark-journal:/data \
  -e SKYLARK_SITE_URL=https://skylark.example.com -e SKYLARK_SITE_SECRET=... \
  -e SKYLARK_PALWORLD_REST_URL=http://palworld:8212 -e SKYLARK_PALWORLD_ADMIN_PASSWORD=... \
  -e SKYLARK_DOCKER_CONTAINER=palworld ghcr.io/oddessentials/skylark-collector
```

IP addresses stay on the server unless `send_ips` is on. Platform user ids go only to your own site, which never shows them publicly. Every event is written to the journal before it is sent and stays there until the site confirms it, so a crash, a restart or a site outage loses nothing. Actions from the site run through the REST API once each, even across restarts.

</details>

<details>
<summary><b>Development</b></summary>

```sh
npm install
docker compose up -d db
npm run dev
```

`npm run dev:mock` runs the pages on recorded fixtures without a database or a server. The fixtures come from a simulated week of server life run through the real ingest (`npm run fixtures:generate`); `web/scripts/simulator` produces the same batches for tests. `npm run verify` runs every check, test and build. CI runs it on every pull request, and a branch merges through a pull request once CI is green.

Pushing a tag `v<version>` that matches the `package.json` version publishes `ghcr.io/oddessentials/skylark` and `ghcr.io/oddessentials/skylark-collector` for amd64 and arm64, and a GitHub release with the collector binaries and their checksums. Pull requests that change the Dockerfiles or the release workflow build all of it without publishing.

Facts about the game come from the free dedicated server's own files: `npm run facts:extract -- --pak <path to Pal-WindowsServer.pak>` rebuilds `web/src/lib/world` and records the game version each file was read from.

</details>

<sub>Skylark is an unofficial fan project, not affiliated with or endorsed by Pocketpair, Inc. Palworld is a trademark of Pocketpair, Inc.</sub>
