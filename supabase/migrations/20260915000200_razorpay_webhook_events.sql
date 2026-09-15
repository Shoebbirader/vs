CREATE TABLE IF NOT EXISTS public.razorpay_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_razorpay_webhook_events_received_at
  ON public.razorpay_webhook_events(received_at);

ALTER TABLE public.razorpay_webhook_events ENABLE ROW LEVEL SECURITY;
