CREATE TABLE "card_locks" (
	"card_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "card_locks" ADD CONSTRAINT "card_locks_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_locks" ADD CONSTRAINT "card_locks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_card_locks_user_id" ON "card_locks" USING btree ("user_id");--> statement-breakpoint
-- Keep Supabase's public Data API out (see 0001)
ALTER TABLE "card_locks" ENABLE ROW LEVEL SECURITY;