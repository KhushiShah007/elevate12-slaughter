CREATE TABLE IF NOT EXISTS "cancellation_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"booking_id" uuid,
	"booking" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"reason" text,
	"refund_method" text,
	"expected_by" timestamp with time zone,
	"provider_ref" text,
	"refunded_inr" integer DEFAULT 0 NOT NULL,
	"auto_follow_up" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_shells" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"booking_id" uuid,
	"provider" text NOT NULL,
	"amount_inr" integer NOT NULL,
	"code" text,
	"expires_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "outbound_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"to_address" text NOT NULL,
	"cc" text,
	"reply_to" text,
	"subject" text,
	"body" text NOT NULL,
	"status" text DEFAULT 'dry_run' NOT NULL,
	"provider" text,
	"related_type" text,
	"related_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"payment_id" uuid,
	"provider_event_id" text,
	"type" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_events_provider_event_id_unique" UNIQUE("provider_event_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"booking_id" uuid,
	"provider" text NOT NULL,
	"provider_order_id" text NOT NULL,
	"provider_payment_id" text,
	"amount_inr" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"method" text,
	"status" text DEFAULT 'created' NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_provider_order_id_unique" UNIQUE("provider_order_id"),
	CONSTRAINT "payments_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"support_url" text NOT NULL,
	"email" text,
	"phone" text,
	"verified" boolean DEFAULT false NOT NULL,
	"source" text NOT NULL,
	"source_url" text,
	"license" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_contacts_provider_unique" UNIQUE("provider")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "refund_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"type" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"actor" text NOT NULL,
	"note" text,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "refund_quotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"refund_inr" integer NOT NULL,
	"fee_inr" integer NOT NULL,
	"components" jsonb NOT NULL,
	"method" text NOT NULL,
	"days" integer NOT NULL,
	"source" text NOT NULL,
	"notes" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "client_id" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "currency" text DEFAULT 'INR' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "payment_id" uuid;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "source" text DEFAULT 'in_app' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "pnr" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cancellation_policy" jsonb;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "details" jsonb;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "points_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "refunded_inr" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cancellation_requests" ADD CONSTRAINT "cancellation_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cancellation_requests" ADD CONSTRAINT "cancellation_requests_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_shells" ADD CONSTRAINT "credit_shells_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_shells" ADD CONSTRAINT "credit_shells_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "outbound_emails" ADD CONSTRAINT "outbound_emails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refund_events" ADD CONSTRAINT "refund_events_request_id_cancellation_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."cancellation_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refund_quotes" ADD CONSTRAINT "refund_quotes_request_id_cancellation_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."cancellation_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_client_id_unique" UNIQUE("client_id");