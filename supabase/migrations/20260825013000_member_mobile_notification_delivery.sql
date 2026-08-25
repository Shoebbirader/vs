ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "mobileNumber" text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "smsAlertsEnabled" boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "whatsappAlertsEnabled" boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "smsOptedInAt" timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "whatsappOptedInAt" timestamptz;

CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "orgId" uuid NOT NULL,
  "notificationId" uuid NOT NULL,
  "recipientId" uuid NOT NULL,
  channel text NOT NULL,
  status text NOT NULL,
  "providerMessageId" text,
  "errorCode" text,
  "errorMessage" text,
  attempt integer NOT NULL DEFAULT 1,
  "contentSid" text,
  "sentAt" timestamptz,
  "deliveredAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_deliveries_notification_idx ON public.notification_deliveries ("notificationId");
CREATE INDEX IF NOT EXISTS notification_deliveries_recipient_idx ON public.notification_deliveries ("recipientId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS notification_deliveries_org_idx ON public.notification_deliveries ("orgId", "createdAt" DESC);
