ALTER TABLE "platform"."processed_mutations" DROP CONSTRAINT "processed_mutations_pkey";--> statement-breakpoint
ALTER TABLE "platform"."processed_mutations" ADD CONSTRAINT "processed_mutations_owner_id_mutation_id_pk" PRIMARY KEY("owner_id","mutation_id");
