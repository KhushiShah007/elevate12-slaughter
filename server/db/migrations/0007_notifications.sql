CREATE TABLE IF NOT EXISTS "notification_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"notification_id" uuid NOT NULL,
	"step" integer DEFAULT 0 NOT NULL,
	"channel" text,
	"action" text NOT NULL,
	"detail" text,
	"cost_inr" real DEFAULT 0 NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_prefs" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"channels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"phone" text,
	"email" text,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"quiet_start" integer DEFAULT 1320 NOT NULL,
	"quiet_end" integer DEFAULT 420 NOT NULL,
	"daily_cap_inr" integer DEFAULT 20 NOT NULL,
	"sms_stopped" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"trip_id" text,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link" text,
	"critical" boolean DEFAULT false NOT NULL,
	"dedupe_key" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"leave_by" timestamp with time zone,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"step" integer DEFAULT 0 NOT NULL,
	"next_at" timestamp with time zone,
	"call_attempts" integer DEFAULT 0 NOT NULL,
	"fast" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"ack_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_events_n_idx" ON "notification_events" USING btree ("notification_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_due_idx" ON "notifications" USING btree ("status","next_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_idx" ON "notifications" USING btree ("user_id","due_at");