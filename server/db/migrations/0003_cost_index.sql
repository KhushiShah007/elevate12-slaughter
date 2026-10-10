CREATE TABLE IF NOT EXISTS "destination_cost_index" (
	"destination_id" integer NOT NULL,
	"style" text NOT NULL,
	"stay" integer NOT NULL,
	"food" integer NOT NULL,
	"transport" integer NOT NULL,
	"activities" integer NOT NULL,
	"source" text NOT NULL,
	"source_url" text,
	"license" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "destination_cost_index_destination_id_style_pk" PRIMARY KEY("destination_id","style")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "destination_cost_index" ADD CONSTRAINT "destination_cost_index_destination_id_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."destinations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
