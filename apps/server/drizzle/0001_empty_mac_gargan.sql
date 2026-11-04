CREATE TYPE "public"."game_session_status" AS ENUM('draft', 'published', 'running', 'closed');--> statement-breakpoint
CREATE TABLE "areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"dm_notes" text DEFAULT '' NOT NULL,
	"revealed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"region_id" uuid NOT NULL,
	CONSTRAINT "areas_id_world" UNIQUE("id","world_id")
);
--> statement-breakpoint
CREATE TABLE "game_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"title" text NOT NULL,
	"scheduled_at" timestamp with time zone,
	"recommended_level" integer,
	"seats" integer,
	"status" "game_session_status" DEFAULT 'draft' NOT NULL,
	"report" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	CONSTRAINT "game_sessions_level" CHECK ("game_sessions"."recommended_level" is null or ("game_sessions"."recommended_level" between 1 and 20)),
	CONSTRAINT "game_sessions_seats" CHECK ("game_sessions"."seats" is null or "game_sessions"."seats" >= 1)
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"dm_notes" text DEFAULT '' NOT NULL,
	"revealed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"area_id" uuid NOT NULL,
	CONSTRAINT "places_id_world" UNIQUE("id","world_id")
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"dm_notes" text DEFAULT '' NOT NULL,
	"revealed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "regions_id_world" UNIQUE("id","world_id")
);
--> statement-breakpoint
CREATE TABLE "scene_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"from_scene_id" uuid NOT NULL,
	"to_scene_id" uuid NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scene_links_pair" UNIQUE("from_scene_id","to_scene_id"),
	CONSTRAINT "scene_links_not_self" CHECK ("scene_links"."from_scene_id" <> "scene_links"."to_scene_id")
);
--> statement-breakpoint
CREATE TABLE "scenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"dm_notes" text DEFAULT '' NOT NULL,
	"revealed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"place_id" uuid NOT NULL,
	CONSTRAINT "scenes_id_world" UNIQUE("id","world_id")
);
--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_region_fk" FOREIGN KEY ("region_id","world_id") REFERENCES "public"."regions"("id","world_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_area_fk" FOREIGN KEY ("area_id","world_id") REFERENCES "public"."areas"("id","world_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regions" ADD CONSTRAINT "regions_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_links" ADD CONSTRAINT "scene_links_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_links" ADD CONSTRAINT "scene_links_from_fk" FOREIGN KEY ("from_scene_id","world_id") REFERENCES "public"."scenes"("id","world_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_links" ADD CONSTRAINT "scene_links_to_fk" FOREIGN KEY ("to_scene_id","world_id") REFERENCES "public"."scenes"("id","world_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_place_fk" FOREIGN KEY ("place_id","world_id") REFERENCES "public"."places"("id","world_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "areas_region_idx" ON "areas" USING btree ("region_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_running_session_per_world" ON "game_sessions" USING btree ("world_id") WHERE "game_sessions"."status" = 'running';--> statement-breakpoint
CREATE INDEX "game_sessions_world_idx" ON "game_sessions" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "places_area_idx" ON "places" USING btree ("area_id");--> statement-breakpoint
CREATE INDEX "regions_world_idx" ON "regions" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "scene_links_world_idx" ON "scene_links" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "scenes_place_idx" ON "scenes" USING btree ("place_id");