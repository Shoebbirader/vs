ALTER TABLE "organization_settings"
  ADD COLUMN IF NOT EXISTS "laborRatePerHour" numeric DEFAULT '0' NOT NULL;
