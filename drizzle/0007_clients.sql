CREATE TABLE "clients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "card_revisions" ADD COLUMN "client" text;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "client_id" text;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_clients_name_lower" ON "clients" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_cards_client_id" ON "cards" USING btree ("client_id");--> statement-breakpoint
-- Like every table: no Supabase Data API access (the app connects as owner and bypasses RLS)
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;