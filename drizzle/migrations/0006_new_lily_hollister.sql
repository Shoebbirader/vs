CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"documentId" uuid NOT NULL,
	"versionNumber" integer NOT NULL,
	"title" text NOT NULL,
	"docType" text NOT NULL,
	"fileUrl" text NOT NULL,
	"fileKey" text,
	"fileChecksum" text,
	"fileSizeBytes" integer,
	"expiryDate" timestamp with time zone NOT NULL,
	"createdById" uuid NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
