ALTER TABLE "tokens" ADD COLUMN "kind" text DEFAULT 'token' NOT NULL;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_kind" CHECK ("tokens"."kind" in ('token', 'text'));