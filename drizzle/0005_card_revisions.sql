CREATE TABLE "card_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"card_id" text NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"notes" text NOT NULL,
	"priority" text NOT NULL,
	"due_date" timestamp with time zone,
	"assignee_id" text,
	"tags" text DEFAULT '[]' NOT NULL,
	"changed_fields" text DEFAULT '[]' NOT NULL,
	"actor_id" text,
	"actor_name" text,
	"restored_from_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "card_revisions" ADD CONSTRAINT "card_revisions_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_card_revisions_card_version" ON "card_revisions" USING btree ("card_id","version");--> statement-breakpoint
-- Keep Supabase's public Data API out (see 0001)
ALTER TABLE "card_revisions" ENABLE ROW LEVEL SECURITY;