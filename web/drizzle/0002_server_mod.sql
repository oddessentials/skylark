CREATE TABLE "feats" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"player_id" integer NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"subject" text NOT NULL,
	"level" integer,
	"detail" text
);
--> statement-breakpoint
ALTER TABLE "deaths" ADD COLUMN "killer_kind" text;--> statement-breakpoint
ALTER TABLE "deaths" ADD COLUMN "killer_level" integer;--> statement-breakpoint
ALTER TABLE "deaths" ADD COLUMN "merged_event_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "feats_event_idx" ON "feats" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "feats_player_kind_idx" ON "feats" USING btree ("player_id","kind");--> statement-breakpoint
CREATE INDEX "feats_at_idx" ON "feats" USING btree ("at");