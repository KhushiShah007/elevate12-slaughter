CREATE TABLE IF NOT EXISTS "airline_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"airline_iata" text NOT NULL,
	"text" text NOT NULL,
	"rating" real,
	"posted_at" timestamp with time zone,
	"sentiment" text,
	"score" real,
	"aspects" jsonb,
	"external_id" text,
	"source" text NOT NULL,
	"source_url" text,
	"license" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "airline_sentiment_scores" (
	"airline_iata" text PRIMARY KEY NOT NULL,
	"overall" real NOT NULL,
	"aspects" jsonb,
	"review_count" integer NOT NULL,
	"sources" text[] DEFAULT '{}'::text[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "airlines" (
	"iata" text PRIMARY KEY NOT NULL,
	"icao" text,
	"name" text NOT NULL,
	"country" text,
	"source" text NOT NULL,
	"source_url" text,
	"license" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "airports" (
	"iata" text PRIMARY KEY NOT NULL,
	"icao" text,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"country" text NOT NULL,
	"lat" real NOT NULL,
	"lon" real NOT NULL,
	"tz" text,
	"route_count" integer DEFAULT 0 NOT NULL,
	"source" text NOT NULL,
	"source_url" text,
	"license" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attractions" (
	"id" serial PRIMARY KEY NOT NULL,
	"destination_id" integer NOT NULL,
	"name" text NOT NULL,
	"lat" real,
	"lon" real,
	"rating" real,
	"image_url" text,
	"persona_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"external_id" text,
	"source" text NOT NULL,
	"source_url" text,
	"license" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"category" text,
	"description" text,
	"opening_hours" text,
	"fee" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"trip_id" uuid,
	"trip_item_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"amount_inr" integer DEFAULT 0 NOT NULL,
	"provider" text,
	"provider_ref" text,
	"payment_status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text DEFAULT 'New chat' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"tool_calls" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "destinations" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"country" text NOT NULL,
	"region" text NOT NULL,
	"is_domestic" boolean NOT NULL,
	"lat" real NOT NULL,
	"lon" real NOT NULL,
	"airport_iata" text,
	"description" text,
	"best_time" text,
	"ideal_days" integer,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"persona_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"daily_cost_inr" jsonb,
	"featured" boolean DEFAULT false NOT NULL,
	"image_url" text,
	"image_thumb_url" text,
	"image_credit" text,
	"image_license" text,
	"source" text NOT NULL,
	"source_url" text,
	"license" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "destinations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "flights_cache" (
	"cache_key" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hotels_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"destination_id" integer NOT NULL,
	"name" text NOT NULL,
	"lat" real,
	"lon" real,
	"rating" real,
	"image_url" text,
	"persona_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"external_id" text,
	"source" text NOT NULL,
	"source_url" text,
	"license" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider" text NOT NULL,
	"stars" real,
	"price_per_night_inr" integer,
	"price_is_estimate" boolean DEFAULT true NOT NULL,
	"amenities" text[] DEFAULT '{}'::text[] NOT NULL,
	"address" text,
	"cancellation" text,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "password_resets" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"nationality" text,
	"home_city" text,
	"persona_id" text,
	"persona_answers" jsonb,
	"persona_notes" jsonb,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"senior_mode" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "restaurants" (
	"id" serial PRIMARY KEY NOT NULL,
	"destination_id" integer NOT NULL,
	"name" text NOT NULL,
	"lat" real,
	"lon" real,
	"rating" real,
	"image_url" text,
	"persona_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"external_id" text,
	"source" text NOT NULL,
	"source_url" text,
	"license" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cuisine" text,
	"price_level" integer,
	"vegetarian" boolean,
	"opening_hours" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "routes" (
	"id" serial PRIMARY KEY NOT NULL,
	"airline_iata" text NOT NULL,
	"src_iata" text NOT NULL,
	"dst_iata" text NOT NULL,
	"stops" integer DEFAULT 0 NOT NULL,
	"equipment" text,
	"source" text NOT NULL,
	"source_url" text,
	"license" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saved_places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"ref_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_receipts" (
	"idempotency_key" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trip_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"step" text DEFAULT 'destination' NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trip_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"price_inr" integer,
	"provider" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"origin" text,
	"destination_id" integer,
	"destination_name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"travellers" integer DEFAULT 1 NOT NULL,
	"budget_inr" integer,
	"status" text DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"google_sub" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_google_sub_unique" UNIQUE("google_sub")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verification_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"doc_type" text NOT NULL,
	"storage_path" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"masked_number" text,
	"extracted" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attractions" ADD CONSTRAINT "attractions_destination_id_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."destinations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bookings" ADD CONSTRAINT "bookings_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bookings" ADD CONSTRAINT "bookings_trip_item_id_trip_items_id_fk" FOREIGN KEY ("trip_item_id") REFERENCES "public"."trip_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hotels_cache" ADD CONSTRAINT "hotels_cache_destination_id_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."destinations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_destination_id_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."destinations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saved_places" ADD CONSTRAINT "saved_places_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sync_receipts" ADD CONSTRAINT "sync_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trip_drafts" ADD CONSTRAINT "trip_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trip_items" ADD CONSTRAINT "trip_items_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trips" ADD CONSTRAINT "trips_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trips" ADD CONSTRAINT "trips_destination_id_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."destinations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "verification_documents" ADD CONSTRAINT "verification_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "airports_city_idx" ON "airports" USING btree ("city");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attractions_dest_idx" ON "attractions" USING btree ("destination_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attractions_ext_idx" ON "attractions" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_messages_conv_idx" ON "chat_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hotels_dest_idx" ON "hotels_cache" USING btree ("destination_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hotels_ext_idx" ON "hotels_cache" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "restaurants_dest_idx" ON "restaurants" USING btree ("destination_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "restaurants_ext_idx" ON "restaurants" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "routes_pair_idx" ON "routes" USING btree ("src_iata","dst_iata");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drafts_user_idx" ON "trip_drafts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trip_items_trip_idx" ON "trip_items" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trips_user_idx" ON "trips" USING btree ("user_id");