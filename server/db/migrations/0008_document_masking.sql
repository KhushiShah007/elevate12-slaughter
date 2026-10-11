CREATE TABLE IF NOT EXISTS "document_masked_blobs" (
	"doc_id" uuid PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"summary" jsonb,
	"iv" "bytea" NOT NULL,
	"tag" "bytea" NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "verification_documents" ADD COLUMN "mask_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "verification_documents" ADD COLUMN "original_deleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_masked_blobs" ADD CONSTRAINT "document_masked_blobs_doc_id_verification_documents_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."verification_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
