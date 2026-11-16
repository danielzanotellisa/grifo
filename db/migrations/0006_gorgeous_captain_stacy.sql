CREATE TABLE "identity"."outgoing_mail" (
	"id" uuid PRIMARY KEY NOT NULL,
	"to_email" text NOT NULL,
	"kind" text NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outgoing_mail_kind_chk" CHECK ("identity"."outgoing_mail"."kind" in ('verification', 'reset'))
);
--> statement-breakpoint
CREATE INDEX "outgoing_mail_created_idx" ON "identity"."outgoing_mail" USING btree ("created_at");