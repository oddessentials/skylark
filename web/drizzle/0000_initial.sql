CREATE TABLE "actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"message" text,
	"user_id" text,
	"waittime_s" integer,
	"not_before" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"error" text,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backups" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"file" text NOT NULL,
	"size_bytes" double precision DEFAULT 0 NOT NULL,
	"ok" boolean NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "bases" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"guild_id" text,
	"name" text,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"z" double precision,
	"first_seen" timestamp with time zone NOT NULL,
	"last_seen" timestamp with time zone NOT NULL,
	"gone_at" timestamp with time zone,
	"workers" integer DEFAULT 0 NOT NULL,
	"workers_seen_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"player_id" integer,
	"channel" text NOT NULL,
	"text" text NOT NULL,
	"guild_name" text
);
--> statement-breakpoint
CREATE TABLE "collector_runs" (
	"run_id" uuid PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"last_seq" integer DEFAULT 0 NOT NULL,
	"stopped_at" timestamp with time zone,
	"lost_at" timestamp with time zone,
	"collector_name" text,
	"collector_version" text,
	"os" text,
	"arch" text,
	"layers" jsonb,
	"server_version" text,
	"server_name" text,
	"world_guid" text,
	"settings" jsonb,
	"heartbeat" jsonb,
	"heartbeat_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "deaths" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"player_id" integer NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"z" double precision,
	"source" text NOT NULL,
	"cause" text,
	"killer" text
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"type" text NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data" jsonb NOT NULL,
	"source" text DEFAULT 'collector' NOT NULL,
	"invalid" text,
	"player_id" integer,
	"quiet" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guild_members" (
	"guild_id" text NOT NULL,
	"player_id" integer NOT NULL,
	"first_seen" timestamp with time zone NOT NULL,
	"last_seen" timestamp with time zone NOT NULL,
	"current" boolean DEFAULT true NOT NULL,
	CONSTRAINT "guild_members_guild_id_player_id_pk" PRIMARY KEY("guild_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "guilds" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"first_seen" timestamp with time zone NOT NULL,
	"last_seen" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" integer NOT NULL,
	"accepted" integer DEFAULT 0 NOT NULL,
	"duplicates" integer DEFAULT 0 NOT NULL,
	"invalid" integer DEFAULT 0 NOT NULL,
	"events" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"progress" double precision,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "level_ups" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"player_id" integer NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"from_level" integer NOT NULL,
	"to_level" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pals" (
	"instance_id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"class_name" text NOT NULL,
	"name" text,
	"level" integer NOT NULL,
	"hp" double precision,
	"max_hp" double precision,
	"owner_player_id" integer,
	"guild_id" text,
	"base_id" integer,
	"action" text,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"z" double precision,
	"first_seen" timestamp with time zone NOT NULL,
	"seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"player_uid" text,
	"platform" text NOT NULL,
	"name" text NOT NULL,
	"account_name" text,
	"name_override" text,
	"hidden" boolean DEFAULT false NOT NULL,
	"first_seen" timestamp with time zone NOT NULL,
	"last_seen" timestamp with time zone NOT NULL,
	"online" boolean DEFAULT false NOT NULL,
	"current_session_id" integer,
	"level" integer DEFAULT 0 NOT NULL,
	"guild_id" text,
	"last_x" double precision,
	"last_y" double precision,
	"last_z" double precision,
	"position_at" timestamp with time zone,
	"hp" double precision,
	"max_hp" double precision,
	"action" text,
	"playtime_s" double precision DEFAULT 0 NOT NULL,
	"sessions" integer DEFAULT 0 NOT NULL,
	"deaths" integer DEFAULT 0 NOT NULL,
	"distance_m" double precision DEFAULT 0 NOT NULL,
	"chat_messages" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"player_id" integer NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"z" double precision,
	CONSTRAINT "positions_player_id_ts_pk" PRIMARY KEY("player_id","ts")
);
--> statement-breakpoint
CREATE TABLE "server_metrics" (
	"ts" timestamp with time zone PRIMARY KEY NOT NULL,
	"fps" double precision NOT NULL,
	"fps_avg" double precision,
	"frame_time_ms" double precision NOT NULL,
	"players" integer NOT NULL,
	"max_players" integer NOT NULL,
	"days" integer NOT NULL,
	"base_camps" integer NOT NULL,
	"uptime_s" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_state" (
	"id" integer PRIMARY KEY NOT NULL,
	"online" boolean DEFAULT false NOT NULL,
	"online_since" timestamp with time zone,
	"offline_since" timestamp with time zone,
	"server_version" text,
	"server_name" text,
	"server_description" text,
	"world_guid" text,
	"player_count" integer DEFAULT 0 NOT NULL,
	"max_players" integer,
	"fps" double precision,
	"fps_avg" double precision,
	"frame_time_ms" double precision,
	"uptime_s" double precision,
	"days" integer,
	"base_camps" integer,
	"metrics_at" timestamp with time zone,
	"in_game_time" text,
	"in_game_day" integer,
	"in_game_at" timestamp with time zone,
	"day_time_speed_rate" double precision,
	"night_time_speed_rate" double precision,
	"snapshot_at" timestamp with time zone,
	"snapshot_source" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"run_id" uuid NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	"left_at" timestamp with time zone,
	"duration_s" double precision,
	"end_reason" text,
	"source" text NOT NULL,
	"join_event_id" uuid,
	"left_event_id" uuid,
	"level_start" integer,
	"level_end" integer,
	"distance_m" double precision DEFAULT 0 NOT NULL,
	"deaths" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "status_samples" (
	"ts" timestamp with time zone PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"players" integer NOT NULL,
	"fps" double precision
);
--> statement-breakpoint
CREATE TABLE "world_live" (
	"id" integer PRIMARY KEY NOT NULL,
	"snapshot_at" timestamp with time zone NOT NULL,
	"wild" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "actions_created_idx" ON "actions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bases_key_idx" ON "bases" USING btree ("key");--> statement-breakpoint
CREATE INDEX "bases_guild_idx" ON "bases" USING btree ("guild_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_messages_event_idx" ON "chat_messages" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "chat_messages_at_idx" ON "chat_messages" USING btree ("at");--> statement-breakpoint
CREATE INDEX "collector_runs_started_idx" ON "collector_runs" USING btree ("started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "deaths_event_idx" ON "deaths" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "deaths_player_at_idx" ON "deaths" USING btree ("player_id","at");--> statement-breakpoint
CREATE INDEX "deaths_at_idx" ON "deaths" USING btree ("at");--> statement-breakpoint
CREATE INDEX "events_ts_seq_idx" ON "events" USING btree ("ts","seq");--> statement-breakpoint
CREATE INDEX "events_type_ts_idx" ON "events" USING btree ("type","ts");--> statement-breakpoint
CREATE INDEX "events_run_seq_idx" ON "events" USING btree ("run_id","seq");--> statement-breakpoint
CREATE INDEX "events_player_ts_idx" ON "events" USING btree ("player_id","ts");--> statement-breakpoint
CREATE INDEX "guild_members_player_idx" ON "guild_members" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "ingest_batches_received_idx" ON "ingest_batches" USING btree ("received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "level_ups_event_idx" ON "level_ups" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "level_ups_player_at_idx" ON "level_ups" USING btree ("player_id","at");--> statement-breakpoint
CREATE INDEX "pals_owner_idx" ON "pals" USING btree ("owner_player_id");--> statement-breakpoint
CREATE INDEX "pals_guild_idx" ON "pals" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "pals_seen_idx" ON "pals" USING btree ("seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "players_user_id_idx" ON "players" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "players_player_uid_idx" ON "players" USING btree ("player_uid");--> statement-breakpoint
CREATE INDEX "players_last_seen_idx" ON "players" USING btree ("last_seen");--> statement-breakpoint
CREATE INDEX "positions_ts_idx" ON "positions" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "sessions_player_joined_idx" ON "sessions" USING btree ("player_id","joined_at");--> statement-breakpoint
CREATE INDEX "sessions_open_idx" ON "sessions" USING btree ("left_at");--> statement-breakpoint
CREATE INDEX "snapshots_ts_idx" ON "snapshots" USING btree ("ts");