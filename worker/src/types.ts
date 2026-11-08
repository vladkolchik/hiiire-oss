export type AiJobStatus = "queued" | "processing" | "done" | "failed" | "canceled";

export type AiJobRow = {
  id: string;
  company_id: string;
  candidate_id: string;
  requested_by: string | null;
  status: AiJobStatus;
  attempt: number;
  max_attempts: number;
  available_at: string;
  locked_at: string | null;
  locked_by: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
};

