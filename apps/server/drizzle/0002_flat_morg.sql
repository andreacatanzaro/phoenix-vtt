CREATE TABLE "images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "images_kind" CHECK ("images"."kind" in ('map', 'token'))
);
--> statement-breakpoint
CREATE TABLE "table_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "table_messages_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"world_id" uuid NOT NULL,
	"game_session_id" uuid NOT NULL,
	"author_account_id" uuid,
	"kind" text NOT NULL,
	"audience" text DEFAULT 'all' NOT NULL,
	"recipient_account_id" uuid,
	"text" text DEFAULT '' NOT NULL,
	"notation" text,
	"roll" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "table_messages_kind" CHECK ("table_messages"."kind" in ('chat', 'roll', 'system')),
	CONSTRAINT "table_messages_audience" CHECK ("table_messages"."audience" in ('all', 'gm', 'whisper'))
);
--> statement-breakpoint
CREATE TABLE "tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"scene_id" uuid NOT NULL,
	"label" text NOT NULL,
	"color" text DEFAULT 'gold' NOT NULL,
	"image_id" uuid,
	"x" integer DEFAULT 0 NOT NULL,
	"y" integer DEFAULT 0 NOT NULL,
	"size" integer DEFAULT 1 NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"travels" boolean DEFAULT false NOT NULL,
	"owner_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tokens_size" CHECK ("tokens"."size" between 1 and 8),
	CONSTRAINT "tokens_position" CHECK ("tokens"."x" between -1000 and 1000 and "tokens"."y" between -1000 and 1000)
);
--> statement-breakpoint
ALTER TABLE "game_sessions" ADD COLUMN "current_scene_id" uuid;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "map_image_id" uuid;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "grid_px" integer DEFAULT 70 NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "grid_offset_x" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "grid_offset_y" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "start_x" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "start_y" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "start_w" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "start_h" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "images" ADD CONSTRAINT "images_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "images" ADD CONSTRAINT "images_uploaded_by_accounts_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_messages" ADD CONSTRAINT "table_messages_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_messages" ADD CONSTRAINT "table_messages_game_session_id_game_sessions_id_fk" FOREIGN KEY ("game_session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_messages" ADD CONSTRAINT "table_messages_author_account_id_accounts_id_fk" FOREIGN KEY ("author_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_messages" ADD CONSTRAINT "table_messages_recipient_account_id_accounts_id_fk" FOREIGN KEY ("recipient_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_image_id_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_owner_account_id_accounts_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_scene_fk" FOREIGN KEY ("scene_id","world_id") REFERENCES "public"."scenes"("id","world_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "images_world_idx" ON "images" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "table_messages_session_idx" ON "table_messages" USING btree ("game_session_id","seq");--> statement-breakpoint
CREATE INDEX "tokens_scene_idx" ON "tokens" USING btree ("scene_id");--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_current_scene_id_scenes_id_fk" FOREIGN KEY ("current_scene_id") REFERENCES "public"."scenes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_map_image_id_images_id_fk" FOREIGN KEY ("map_image_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_grid_px" CHECK ("scenes"."grid_px" between 10 and 400);--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_start_zone" CHECK ("scenes"."start_w" between 1 and 64 and "scenes"."start_h" between 1 and 64);