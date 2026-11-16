CREATE SCHEMA "platform";
--> statement-breakpoint
CREATE SCHEMA "annotation";
--> statement-breakpoint
CREATE SCHEMA "export";
--> statement-breakpoint
CREATE SCHEMA "identity";
--> statement-breakpoint
CREATE SCHEMA "library";
--> statement-breakpoint
CREATE SCHEMA "outline";
--> statement-breakpoint
CREATE SCHEMA "study";
--> statement-breakpoint
CREATE TYPE "annotation"."outline_role" AS ENUM('TOPIC', 'DEFINITION', 'ITEM', 'IGNORE');--> statement-breakpoint
CREATE TYPE "export"."export_kind" AS ENUM('SUMMARY_PDF', 'ANNOTATED_PDF', 'FLASHCARDS_APKG', 'FULL_DATA');--> statement-breakpoint
CREATE TYPE "export"."export_scope" AS ENUM('DOCUMENT', 'SUBJECT', 'ACCOUNT');--> statement-breakpoint
CREATE TYPE "export"."export_status" AS ENUM('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TYPE "library"."document_status" AS ENUM('UPLOADED', 'VALIDATING', 'READY', 'REJECTED', 'QUARANTINED');--> statement-breakpoint
CREATE TYPE "outline"."outline_role" AS ENUM('TOPIC', 'DEFINITION', 'ITEM', 'IGNORE');--> statement-breakpoint
CREATE TABLE "platform"."change_log" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"op" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform"."processed_mutations" (
	"mutation_id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"outcome" jsonb NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "annotation"."categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"color" char(7) NOT NULL,
	"role" "annotation"."outline_role" NOT NULL,
	"shortcut" smallint,
	"position" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "annotation"."highlights" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"document_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"page_index" integer NOT NULL,
	"rects" jsonb NOT NULL,
	"quote" jsonb NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "export"."exports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"kind" "export"."export_kind" NOT NULL,
	"scope" "export"."export_scope" NOT NULL,
	"scope_id" uuid,
	"status" "export"."export_status" DEFAULT 'QUEUED' NOT NULL,
	"template_id" text,
	"template_version" integer,
	"snapshot_cursor" bigint NOT NULL,
	"result_key" text,
	"error" jsonb,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "identity"."users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "library"."documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"subject_id" uuid NOT NULL,
	"stored_file_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" "library"."document_status" DEFAULT 'UPLOADED' NOT NULL,
	"page_count" integer,
	"risk_flags" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library"."stored_files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"sha256" char(64) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library"."subjects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outline"."nodes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"document_id" uuid NOT NULL,
	"parent_id" uuid,
	"position" text NOT NULL,
	"highlight_id" uuid,
	"role" "outline"."outline_role",
	"text" text,
	CONSTRAINT "nodes_shape_chk" CHECK ("outline"."nodes"."highlight_id" is not null or ("outline"."nodes"."role" is not null and "outline"."nodes"."text" is not null))
);
--> statement-breakpoint
CREATE TABLE "study"."flashcards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"document_id" uuid NOT NULL,
	"source_node_id" uuid,
	"front" text NOT NULL,
	"back" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "annotation"."highlights" ADD CONSTRAINT "highlights_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "annotation"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library"."documents" ADD CONSTRAINT "documents_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "library"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library"."documents" ADD CONSTRAINT "documents_stored_file_id_stored_files_id_fk" FOREIGN KEY ("stored_file_id") REFERENCES "library"."stored_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "change_log_owner_seq_idx" ON "platform"."change_log" USING btree ("owner_id","seq");--> statement-breakpoint
CREATE INDEX "categories_owner_idx" ON "annotation"."categories" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "highlights_owner_document_idx" ON "annotation"."highlights" USING btree ("owner_id","document_id","page_index");--> statement-breakpoint
CREATE INDEX "exports_owner_created_idx" ON "export"."exports" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "identity"."users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "documents_owner_subject_idx" ON "library"."documents" USING btree ("owner_id","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stored_files_owner_sha_uq" ON "library"."stored_files" USING btree ("owner_id","sha256");--> statement-breakpoint
CREATE INDEX "subjects_owner_idx" ON "library"."subjects" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "nodes_owner_document_idx" ON "outline"."nodes" USING btree ("owner_id","document_id");--> statement-breakpoint
CREATE INDEX "flashcards_owner_document_idx" ON "study"."flashcards" USING btree ("owner_id","document_id");