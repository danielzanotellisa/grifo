ALTER TABLE "annotation"."categories" ADD COLUMN "deleted_root_id" uuid;--> statement-breakpoint
ALTER TABLE "annotation"."highlights" ADD COLUMN "deleted_root_id" uuid;--> statement-breakpoint
ALTER TABLE "export"."exports" ADD COLUMN "deleted_root_id" uuid;--> statement-breakpoint
ALTER TABLE "library"."documents" ADD COLUMN "deleted_root_id" uuid;--> statement-breakpoint
ALTER TABLE "library"."subjects" ADD COLUMN "deleted_root_id" uuid;--> statement-breakpoint
ALTER TABLE "outline"."nodes" ADD COLUMN "deleted_root_id" uuid;--> statement-breakpoint
ALTER TABLE "study"."flashcards" ADD COLUMN "deleted_root_id" uuid;--> statement-breakpoint
UPDATE "annotation"."categories" SET "deleted_root_id" = "id" WHERE "deleted_at" IS NOT NULL;--> statement-breakpoint
UPDATE "annotation"."highlights" SET "deleted_root_id" = "id" WHERE "deleted_at" IS NOT NULL;--> statement-breakpoint
UPDATE "export"."exports" SET "deleted_root_id" = "id" WHERE "deleted_at" IS NOT NULL;--> statement-breakpoint
UPDATE "library"."documents" SET "deleted_root_id" = "id" WHERE "deleted_at" IS NOT NULL;--> statement-breakpoint
UPDATE "library"."subjects" SET "deleted_root_id" = "id" WHERE "deleted_at" IS NOT NULL;--> statement-breakpoint
UPDATE "outline"."nodes" SET "deleted_root_id" = "id" WHERE "deleted_at" IS NOT NULL;--> statement-breakpoint
UPDATE "study"."flashcards" SET "deleted_root_id" = "id" WHERE "deleted_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "annotation"."categories" ADD CONSTRAINT "categories_soft_delete_chk" CHECK (("annotation"."categories"."deleted_at" is null) = ("annotation"."categories"."deleted_root_id" is null));--> statement-breakpoint
ALTER TABLE "annotation"."highlights" ADD CONSTRAINT "highlights_soft_delete_chk" CHECK (("annotation"."highlights"."deleted_at" is null) = ("annotation"."highlights"."deleted_root_id" is null));--> statement-breakpoint
ALTER TABLE "export"."exports" ADD CONSTRAINT "exports_soft_delete_chk" CHECK (("export"."exports"."deleted_at" is null) = ("export"."exports"."deleted_root_id" is null));--> statement-breakpoint
ALTER TABLE "library"."documents" ADD CONSTRAINT "documents_soft_delete_chk" CHECK (("library"."documents"."deleted_at" is null) = ("library"."documents"."deleted_root_id" is null));--> statement-breakpoint
ALTER TABLE "library"."subjects" ADD CONSTRAINT "subjects_soft_delete_chk" CHECK (("library"."subjects"."deleted_at" is null) = ("library"."subjects"."deleted_root_id" is null));--> statement-breakpoint
ALTER TABLE "outline"."nodes" ADD CONSTRAINT "nodes_soft_delete_chk" CHECK (("outline"."nodes"."deleted_at" is null) = ("outline"."nodes"."deleted_root_id" is null));--> statement-breakpoint
ALTER TABLE "study"."flashcards" ADD CONSTRAINT "flashcards_soft_delete_chk" CHECK (("study"."flashcards"."deleted_at" is null) = ("study"."flashcards"."deleted_root_id" is null));