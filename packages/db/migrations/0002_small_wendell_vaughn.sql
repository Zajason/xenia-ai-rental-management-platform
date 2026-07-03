CREATE TYPE "public"."payee_type" AS ENUM('staff', 'vendor');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('pending', 'processing', 'paid', 'failed');--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"payer_user_id" uuid,
	"payee_type" "payee_type" NOT NULL,
	"payee_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"status" "payout_status" DEFAULT 'pending' NOT NULL,
	"provider" varchar(24) DEFAULT 'simulated' NOT NULL,
	"provider_ref" varchar(191),
	"task_id" uuid,
	"ticket_id" uuid,
	"note" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "webhook_secret" text;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_payer_user_id_users_id_fk" FOREIGN KEY ("payer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;