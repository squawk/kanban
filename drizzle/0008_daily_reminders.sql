-- Reminders become one per card per morning (due tomorrow, due today, and overdue
-- every morning until done), so each row records the local day it was sent.
ALTER TABLE "due_reminders" ADD COLUMN "sent_day" text;--> statement-breakpoint
-- Existing rows: the day they were sent, in the default reminder time zone
UPDATE "due_reminders" SET "sent_day" = to_char("created_at" AT TIME ZONE 'America/Los_Angeles', 'YYYY-MM-DD') WHERE "sent_day" IS NULL;--> statement-breakpoint
ALTER TABLE "due_reminders" ALTER COLUMN "sent_day" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "due_reminders" DROP CONSTRAINT "due_reminders_card_id_kind_due_day_pk";--> statement-breakpoint
ALTER TABLE "due_reminders" ADD CONSTRAINT "due_reminders_card_id_due_day_sent_day_pk" PRIMARY KEY("card_id","due_day","sent_day");
