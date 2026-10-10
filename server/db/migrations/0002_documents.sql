CREATE TABLE IF NOT EXISTS "document_blobs" (
	"doc_id" uuid PRIMARY KEY NOT NULL,
	"iv" "bytea" NOT NULL,
	"tag" "bytea" NOT NULL,
	"data" "bytea" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "verification_documents" ADD COLUMN "id_type" text;--> statement-breakpoint
ALTER TABLE "verification_documents" ADD COLUMN "title" text DEFAULT 'Document' NOT NULL;--> statement-breakpoint
ALTER TABLE "verification_documents" ADD COLUMN "holder" text;--> statement-breakpoint
ALTER TABLE "verification_documents" ADD COLUMN "trip_id" text;--> statement-breakpoint
ALTER TABLE "verification_documents" ADD COLUMN "expires_on" date;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_blobs" ADD CONSTRAINT "document_blobs_doc_id_verification_documents_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."verification_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
