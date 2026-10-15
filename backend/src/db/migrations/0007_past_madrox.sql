CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"subject_type" varchar(16) NOT NULL,
	"subject_id" uuid,
	"gateway" varchar(16) NOT NULL,
	"gateway_ref" varchar(128) NOT NULL,
	"amount" bigint NOT NULL,
	"fee" bigint DEFAULT 0 NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" varchar(16) DEFAULT 'created' NOT NULL,
	"raw_payload" jsonb,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_payments_gateway" CHECK ("gateway" IN ('stripe', 'razorpay')),
	CONSTRAINT "ck_payments_subject" CHECK ("subject_type" IN ('order', 'subscription', 'group_gift')),
	CONSTRAINT "ck_payments_status" CHECK ("status" IN ('created', 'authorized', 'captured', 'failed', 'refunded', 'disputed')),
	CONSTRAINT "ck_payments_currency" CHECK ("payments"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "ck_payments_fee" CHECK (abs("payments"."fee") <= abs("payments"."amount"))
);
--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "subscription_ai_features" (
	"subscription_id" uuid NOT NULL,
	"feature" varchar(16) NOT NULL,
	CONSTRAINT "pk_subscription_ai_features" PRIMARY KEY("subscription_id","feature"),
	CONSTRAINT "ck_sub_ai_feature" CHECK ("feature" IN ('semantic_search', 'transcription', 'auto_titles', 'face_grouping'))
);
--> statement-breakpoint
ALTER TABLE "subscription_ai_features" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "subscription_channels" (
	"subscription_id" uuid NOT NULL,
	"channel" varchar(16) NOT NULL,
	CONSTRAINT "pk_subscription_channels" PRIMARY KEY("subscription_id","channel"),
	CONSTRAINT "ck_sub_channel" CHECK ("channel" IN ('push', 'email', 'sms', 'whatsapp'))
);
--> statement-breakpoint
ALTER TABLE "subscription_channels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"stripe_customer_id" varchar(64),
	"razorpay_customer_id" varchar(64),
	"stripe_subscription_id" varchar(64),
	"plan" varchar(16) DEFAULT 'free' NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"region" varchar(8) DEFAULT 'IN' NOT NULL,
	"current_period_end" timestamp (3) with time zone,
	"cancel_at" timestamp (3) with time zone,
	"storage_quota_bytes" bigint DEFAULT 10737418240 NOT NULL,
	"max_pending_capsules" integer,
	"max_capsule_horizon_days" integer,
	"max_video_seconds" integer DEFAULT 60 NOT NULL,
	"seats" integer DEFAULT 1 NOT NULL,
	"broadcast_recipients_per_month" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_subs_plan" CHECK ("plan" IN ('free', 'premium', 'family')),
	CONSTRAINT "ck_subs_status" CHECK ("status" IN ('trialing', 'active', 'past_due', 'cancelled', 'expired')),
	CONSTRAINT "ck_subs_entitlements_sane" CHECK ("subscriptions"."storage_quota_bytes" >= 0
          AND "subscriptions"."max_video_seconds" > 0
          AND "subscriptions"."seats" >= 1
          AND "subscriptions"."broadcast_recipients_per_month" >= 0
          AND ("subscriptions"."max_pending_capsules" IS NULL OR "subscriptions"."max_pending_capsules" >= 0)
          AND ("subscriptions"."max_capsule_horizon_days" IS NULL OR "subscriptions"."max_capsule_horizon_days" > 0)),
	CONSTRAINT "ck_subs_currency" CHECK ("subscriptions"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_ai_features" ADD CONSTRAINT "subscription_ai_features_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_channels" ADD CONSTRAINT "subscription_channels_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ux_payments_gateway_ref" ON "payments" USING btree ("gateway","gateway_ref");--> statement-breakpoint
CREATE INDEX "ix_payments_user" ON "payments" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ix_payments_subject" ON "payments" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "ix_payments_status" ON "payments" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_subs_user" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ix_subs_stripe" ON "subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "ix_subs_period_end" ON "subscriptions" USING btree ("status","current_period_end");
--> statement-breakpoint

-- ─── Conventions ────────────────────────────────────────────────────────────

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON "subscriptions"
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON "payments"
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

-- ─── Entitlements are frozen for obligations already made ───────────────────
--
-- Commitment 05: a promise is never cancelled for non-payment.
--
-- The shape of this domain is most of the mechanism — entitlements are columns
-- on the subscription row, so a lapsed row still says what was granted, and
-- nothing in the delivery path reads this domain at all.
--
-- This function is the remaining piece: the ONE question the capsule-sealing
-- path needs answered, in a form that cannot accidentally be asked at delivery
-- time. It reports what a user may seal NOW. There is deliberately no function
-- that asks whether an ALREADY SEALED capsule is still entitled, because such a
-- function is the thing that would eventually get called in the delivery
-- worker — and then a lapsed card would cancel a message from somebody's dead
-- father.
CREATE OR REPLACE FUNCTION app_sealing_entitlement(p_user uuid)
  RETURNS TABLE (
    max_pending_capsules     int,
    max_capsule_horizon_days int,
    pending_now              bigint
  )
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT s.max_pending_capsules,
         s.max_capsule_horizon_days,
         (SELECT count(*) FROM capsules c
           WHERE c.owner_id = p_user
             AND c.state = 'sealed'
             AND c.delivered_at IS NULL)
  FROM subscriptions s
  WHERE s.user_id = p_user
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_sealing_entitlement(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_sealing_entitlement(uuid) TO mm_app;
--> statement-breakpoint

-- ─── Policies ───────────────────────────────────────────────────────────────
--
-- Everything here is READ-ONLY to the API, and that is the whole posture of
-- this domain.
--
-- Money state is owned by the gateway. Our rows are a record of what Stripe and
-- Razorpay told us, written by the webhook handler under its own role. A
-- request handler that could write them could grant itself a plan, and an
-- entitlement the user did not pay for is the same bug as a charge they did not
-- make — only quieter.

CREATE POLICY subscriptions_read ON subscriptions FOR SELECT
  USING (user_id = app_current_user());
--> statement-breakpoint

CREATE POLICY subscription_channels_read ON subscription_channels FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.id = subscription_channels.subscription_id
        AND s.user_id = app_current_user()
    )
  );
--> statement-breakpoint

CREATE POLICY subscription_ai_features_read ON subscription_ai_features FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.id = subscription_ai_features.subscription_id
        AND s.user_id = app_current_user()
    )
  );
--> statement-breakpoint

-- A user sees their own receipts. Nobody edits them: a ledger that can be
-- rewritten is not a ledger, and a dispute two years from now is argued from
-- what the provider actually sent.
CREATE POLICY payments_read ON payments FOR SELECT
  USING (user_id = app_current_user());
