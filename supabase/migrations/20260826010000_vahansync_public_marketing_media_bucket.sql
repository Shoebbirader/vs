-- Public, read-only marketing assets for the VahanSync landing page.
-- Uploads are performed by an authorized deployment workflow, not browser clients.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vahansync-media',
  'vahansync-media',
  true,
  26214400,
  ARRAY['video/mp4']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
