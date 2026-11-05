ALTER TABLE "areas" ADD COLUMN "polygon" jsonb;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "map_image_id" uuid;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "pin" jsonb;--> statement-breakpoint
ALTER TABLE "regions" ADD COLUMN "map_image_id" uuid;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "pin" jsonb;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_map_image_id_images_id_fk" FOREIGN KEY ("map_image_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regions" ADD CONSTRAINT "regions_map_image_id_images_id_fk" FOREIGN KEY ("map_image_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;