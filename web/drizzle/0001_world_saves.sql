CREATE TABLE "base_saves" (
	"base_id" text PRIMARY KEY NOT NULL,
	"saved_at" timestamp with time zone NOT NULL,
	"guild_id" text,
	"name" text,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"z" double precision,
	"workers" jsonb NOT NULL,
	"gone_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "guild_saves" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"saved_at" timestamp with time zone NOT NULL,
	"name" text NOT NULL,
	"base_camp_level" integer,
	"members" jsonb NOT NULL,
	"gone_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "player_saves" (
	"player_uid" text PRIMARY KEY NOT NULL,
	"saved_at" timestamp with time zone NOT NULL,
	"name" text,
	"level" integer,
	"guild_id" text,
	"last_online_at" timestamp with time zone,
	"progress" jsonb,
	"gone_at" timestamp with time zone
);
