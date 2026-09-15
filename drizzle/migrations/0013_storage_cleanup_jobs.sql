CREATE TABLE "storage_cleanup_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "orgId" uuid NOT NULL,
  "bucket" text NOT NULL,
  "fileKey" text NOT NULL,
  "reason" text NOT NULL,
  "attempts" integer NOT NULL DEFAULT 0,
  "nextAttemptAt" timestamptz NOT NULL DEFAULT now(),
  "completedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "idx_storage_cleanup_jobs_orgId" ON "storage_cleanup_jobs" USING btree ("orgId");
--> statement-breakpoint
CREATE INDEX "idx_storage_cleanup_jobs_pending" ON "storage_cleanup_jobs" USING btree ("nextAttemptAt");
