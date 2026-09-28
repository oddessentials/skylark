CREATE TABLE "egg_saves" (
	"egg_id" text PRIMARY KEY NOT NULL,
	"saved_at" timestamp with time zone NOT NULL,
	"player_uid" text,
	"base_id" text,
	"place" text NOT NULL,
	"object_id" text,
	"item_id" text NOT NULL,
	"species" text NOT NULL,
	"alpha" boolean NOT NULL,
	"hatched" jsonb,
	"gone_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pal_saves" (
	"instance_id" text PRIMARY KEY NOT NULL,
	"player_uid" text NOT NULL,
	"saved_at" timestamp with time zone NOT NULL,
	"place" text NOT NULL,
	"species" text NOT NULL,
	"alpha" boolean NOT NULL,
	"gender" text,
	"level" integer NOT NULL,
	"rank" integer NOT NULL,
	"talent_hp" integer NOT NULL,
	"talent_shot" integer NOT NULL,
	"talent_defense" integer NOT NULL,
	"passives" jsonb NOT NULL,
	"lucky" boolean NOT NULL,
	"name" text,
	"gone_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "egg_saves_player_idx" ON "egg_saves" USING btree ("player_uid");--> statement-breakpoint
CREATE INDEX "egg_saves_base_idx" ON "egg_saves" USING btree ("base_id");--> statement-breakpoint
CREATE INDEX "pal_saves_player_idx" ON "pal_saves" USING btree ("player_uid");