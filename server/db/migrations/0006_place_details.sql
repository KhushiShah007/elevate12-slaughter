ALTER TABLE "attractions" ADD COLUMN "famous" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "attractions" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "attractions" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "diets" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "reservation" text;