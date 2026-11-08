-- Ensure `resumes` bucket allows PDF/DOC/DOCX/TXT uploads and enforces 5MB limit.
--
-- Note: If the bucket doesn't exist yet, create it first (see docs/DATABASE_SCHEMA.md).

UPDATE storage.buckets
SET
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
WHERE id = 'resumes';

