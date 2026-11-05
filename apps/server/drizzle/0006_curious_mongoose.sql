CREATE TABLE "token_library" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT 'gold' NOT NULL,
	"size" integer DEFAULT 1 NOT NULL,
	"image_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "token_library_size" CHECK ("token_library"."size" between 1 and 8)
);
--> statement-breakpoint
ALTER TABLE "token_library" ADD CONSTRAINT "token_library_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_library" ADD CONSTRAINT "token_library_image_id_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "token_library_world_idx" ON "token_library" USING btree ("world_id");