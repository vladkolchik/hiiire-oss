-- Add new candidate status: security-check ("Проверка СБ")
--
-- Current schema uses TEXT + CHECK constraint on candidates.status.
-- This migration updates that constraint to include the new value.

ALTER TABLE public.candidates
  DROP CONSTRAINT IF EXISTS candidates_status_check;

ALTER TABLE public.candidates
  ADD CONSTRAINT candidates_status_check
  CHECK (
    status IN (
      'new',
      'reviewing',
      'security-check',
      'interview-scheduled',
      'interviewed',
      'offer',
      'hired',
      'rejected'
    )
  );

