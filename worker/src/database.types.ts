export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/**
 * Worker-only minimal DB types (subset).
 * Keep in sync with `docs/DATABASE_SCHEMA.md` and `supabase/sql/ai_jobs.sql`.
 */
export type Database = {
  public: {
    Tables: {
      company_credits: {
        Row: { company_id: string; balance: number; reserved: number; updated_at: string };
        Insert: { company_id: string; balance?: number; reserved?: number; updated_at?: string };
        Update: { company_id?: string; balance?: number; reserved?: number; updated_at?: string };
        Relationships: [];
      };
      feedback: {
        Row: {
          id: string;
          company_id: string;
          user_id: string;
          page: string;
          message: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          user_id: string;
          page: string;
          message: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["feedback"]["Insert"]>;
        Relationships: [];
      };
      candidates: {
        Row: {
          id: string;
          name: string;
          position: string;
          vacancy_id: string;
          created_by: string;
          resume_text: string | null;
          desired_salary_text: string | null;
          desired_salary_amount: number | null;
          desired_salary_currency: string | null;
          desired_salary_source: "hh" | "ai_parser" | "regex" | null;
          avatar_url: string | null;
          hh_auto_survey_text: string | null;
          ai_score: number | null;
          match_percentage: number | null;
          status: "new" | "reviewing" | "security-check" | "interview-scheduled" | "interviewed" | "offer" | "hired" | "rejected";
          source: "hh.ru" | "manual" | "referral" | "other";
          applied_at: string;
          hhru_resume_id: string | null;
          created_at: string;
          hh_source_fingerprint: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name?: string;
          position?: string;
          vacancy_id: string;
          created_by?: string;
          resume_text?: string | null;
          desired_salary_text?: string | null;
          desired_salary_amount?: number | null;
          desired_salary_currency?: string | null;
          desired_salary_source?: "hh" | "ai_parser" | "regex" | null;
          avatar_url?: string | null;
          hh_auto_survey_text?: string | null;
          ai_score?: number | null;
          match_percentage?: number | null;
          status?: "new" | "reviewing" | "security-check" | "interview-scheduled" | "interviewed" | "offer" | "hired" | "rejected";
          source?: "hh.ru" | "manual" | "referral" | "other";
          applied_at?: string;
          hhru_resume_id?: string | null;
          created_at?: string;
          hh_source_fingerprint?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["candidates"]["Insert"]>;
        Relationships: [];
      };
      vacancies: {
        Row: {
          id: string;
          title: string;
          company_id: string;
          created_by: string;
          description: string;
          requirements: string[];
          responsibilities: string[];
          salary_min: number | null;
          salary_max: number | null;
          salary_currency: string;
          location: string;
          experience_level: "trainee" | "junior" | "middle" | "senior" | "lead";
          status: "draft" | "active" | "paused" | "closed";
          salary_period: "month" | "hour" | "shift";
          salary_tax: "gross" | "net" | null;
          hhru_vacancy_id: string | null;
          created_at: string;
          updated_at: string;
          hh_source_fingerprint: string | null;
        };
        Insert: {
          id?: string;
          title?: string;
          company_id: string;
          created_by?: string;
          description: string;
          requirements: string[];
          responsibilities?: string[];
          salary_min?: number | null;
          salary_max?: number | null;
          salary_currency?: string;
          location?: string;
          experience_level?: "trainee" | "junior" | "middle" | "senior" | "lead";
          status?: "draft" | "active" | "paused" | "closed";
          salary_period?: "month" | "hour" | "shift";
          salary_tax?: "gross" | "net" | null;
          hhru_vacancy_id?: string | null;
          created_at?: string;
          updated_at?: string;
          hh_source_fingerprint?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["vacancies"]["Insert"]>;
        Relationships: [];
      };
      candidate_contacts: {
        Row: {
          id: string;
          candidate_id: string;
          type: string;
          value: string;
          label: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          candidate_id: string;
          type: string;
          value: string;
          label?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["candidate_contacts"]["Insert"]>;
        Relationships: [];
      };
      integrations_accounts: {
        Row: {
          id: string;
          company_id: string;
          user_id: string;
          provider: "hh.ru";
          is_active: boolean;
          access_token: string | null;
          refresh_token: string | null;
          token_expires_at: string | null;
          settings: Json | null;
          connected_at: string;
          last_synced_at: string | null;
          sync_started_at: string | null;
          sync_lock_expires_at: string | null;
          last_sync_error: string | null;
          last_sync_error_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          user_id: string;
          provider: "hh.ru";
          is_active?: boolean;
          access_token?: string | null;
          refresh_token?: string | null;
          token_expires_at?: string | null;
          settings?: Json | null;
          connected_at?: string;
          last_synced_at?: string | null;
          sync_started_at?: string | null;
          sync_lock_expires_at?: string | null;
          last_sync_error?: string | null;
          last_sync_error_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["integrations_accounts"]["Insert"]>;
        Relationships: [];
      };
      ai_analyses: {
        Row: {
          id: string;
          candidate_id: string;
          overall_score: number;
          category_scores: Json;
          summary: string | null;
          verdict: string | null;
          reasons: string[] | null;
          prospects: string | null;
          strengths: string[];
          weaknesses: string[];
          recommendations: string[];
          ai_provider: string;
          analyzed_at: string;
          credits_charged: number;
          provider_model: string | null;
          tokens_in: number | null;
          tokens_out: number | null;
        };
        Insert: {
          id?: string;
          candidate_id: string;
          overall_score: number;
          category_scores: Json;
          summary?: string | null;
          verdict?: string | null;
          reasons?: string[] | null;
          prospects?: string | null;
          strengths: string[];
          weaknesses: string[];
          recommendations: string[];
          ai_provider?: string;
          analyzed_at?: string;
          credits_charged?: number;
          provider_model?: string | null;
          tokens_in?: number | null;
          tokens_out?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["ai_analyses"]["Insert"]>;
        Relationships: [];
      };
      jobs_ai: {
        Row: {
          id: string;
          company_id: string;
          candidate_id: string;
          requested_by: string | null;
          status: "queued" | "processing" | "done" | "failed" | "canceled";
          attempt: number;
          max_attempts: number;
          available_at: string;
          started_at: string | null;
          locked_at: string | null;
          locked_by: string | null;
          last_error: string | null;
          created_at: string;
          updated_at: string;
          finished_at: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          candidate_id: string;
          requested_by?: string | null;
          status?: "queued" | "processing" | "done" | "failed" | "canceled";
          attempt?: number;
          max_attempts?: number;
          available_at?: string;
          started_at?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
          finished_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["jobs_ai"]["Insert"]>;
        Relationships: [];
      };
      assistant_threads: {
        Row: {
          id: string;
          company_id: string;
          client_account_id: string | null;
          scope_type: "company" | "vacancy" | "candidate" | "interview" | "support" | "client_account";
          scope_id: string | null;
          mode: "general" | "screening" | "outreach" | "interview" | "pipeline" | "support";
          title: string;
          owner_id: string;
          visibility: "private" | "company";
          summary: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          client_account_id?: string | null;
          scope_type?: "company" | "vacancy" | "candidate" | "interview" | "support" | "client_account";
          scope_id?: string | null;
          mode?: "general" | "screening" | "outreach" | "interview" | "pipeline" | "support";
          title: string;
          owner_id: string;
          visibility?: "private" | "company";
          summary?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["assistant_threads"]["Insert"]>;
        Relationships: [];
      };
      assistant_messages: {
        Row: {
          id: string;
          thread_id: string;
          company_id: string;
          role: "user" | "assistant" | "tool" | "system";
          content: string;
          metadata: Json;
          model: string | null;
          provider: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          thread_id: string;
          company_id: string;
          role: "user" | "assistant" | "tool" | "system";
          content: string;
          metadata?: Json;
          model?: string | null;
          provider?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["assistant_messages"]["Insert"]>;
        Relationships: [];
      };
      assistant_context_items: {
        Row: {
          id: string;
          thread_id: string;
          company_id: string;
          kind: "pinned" | "transient" | "retrieved";
          entity_type: string;
          entity_id: string | null;
          source_label: string;
          metadata: Json;
          added_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          thread_id: string;
          company_id: string;
          kind: "pinned" | "transient" | "retrieved";
          entity_type: string;
          entity_id?: string | null;
          source_label: string;
          metadata?: Json;
          added_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["assistant_context_items"]["Insert"]>;
        Relationships: [];
      };
      assistant_tool_runs: {
        Row: {
          id: string;
          thread_id: string;
          message_id: string | null;
          company_id: string;
          tool_name: string;
          input_preview: Json;
          risk_level: "read" | "draft" | "ai_cost" | "crm_write" | "external" | "destructive";
          policy_decision:
            | "auto_approved"
            | "manual_approval_required"
            | "failed_access_check"
            | "failed_credit_check"
            | "not_supported_yet"
            | "blocked";
          approval_status: "not_required" | "pending" | "approved" | "rejected" | "expired";
          approved_by: string | null;
          executed_at: string | null;
          result_preview: Json;
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          thread_id: string;
          message_id?: string | null;
          company_id: string;
          tool_name: string;
          input_preview?: Json;
          risk_level: "read" | "draft" | "ai_cost" | "crm_write" | "external" | "destructive";
          policy_decision:
            | "auto_approved"
            | "manual_approval_required"
            | "failed_access_check"
            | "failed_credit_check"
            | "not_supported_yet"
            | "blocked";
          approval_status?: "not_required" | "pending" | "approved" | "rejected" | "expired";
          approved_by?: string | null;
          executed_at?: string | null;
          result_preview?: Json;
          error_message?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["assistant_tool_runs"]["Insert"]>;
        Relationships: [];
      };
      assistant_audit_events: {
        Row: {
          id: string;
          company_id: string;
          thread_id: string | null;
          tool_run_id: string | null;
          actor_user_id: string | null;
          event_type: string;
          entity_type: string | null;
          entity_id: string | null;
          before_snapshot: Json | null;
          after_snapshot: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          thread_id?: string | null;
          tool_run_id?: string | null;
          actor_user_id?: string | null;
          event_type: string;
          entity_type?: string | null;
          entity_id?: string | null;
          before_snapshot?: Json | null;
          after_snapshot?: Json | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["assistant_audit_events"]["Insert"]>;
        Relationships: [];
      };
      worker_heartbeats: {
        Row: {
          worker_id: string;
          last_seen_at: string;
          concurrency: number;
          provider: string | null;
          version: string | null;
          updated_at: string;
        };
        Insert: {
          worker_id: string;
          last_seen_at: string;
          concurrency: number;
          provider?: string | null;
          version?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["worker_heartbeats"]["Insert"]>;
        Relationships: [];
      };
      credit_ledger: {
        Row: {
          id: string;
          company_id: string;
          delta: number;
          reason: "grant" | "manual_adjustment" | "resume_analysis" | "refund";
          reference_type: string | null;
          reference_id: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          delta: number;
          reason: "grant" | "manual_adjustment" | "resume_analysis" | "refund";
          reference_type?: string | null;
          reference_id?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      claim_due_hh_integration: {
        Args: { worker_id: string; cutoff: string; lease_seconds?: number };
        Returns: Database["public"]["Tables"]["integrations_accounts"]["Row"] | null;
      };
      claim_next_ai_job: {
        Args: { worker_id: string };
        Returns: Database["public"]["Tables"]["jobs_ai"]["Row"] | null;
      };
      get_ai_queue_metrics: {
        Args: { p_hours?: number };
        Returns: Json;
      };
      get_signup_email_state: {
        Args: { p_email: string };
        Returns: {
          user_id: string;
          email: string;
          email_confirmed: boolean;
        }[];
      };
      ensure_ai_job_reservation: {
        Args: { p_job_id: string; p_company_id: string; p_requested_by: string | null; p_credits_to_reserve?: number };
        Returns: boolean;
      };
      release_ai_job_reservation: {
        Args: { p_job_id: string; reason?: string | null };
        Returns: void;
      };
      finalize_ai_job: {
        Args: {
          job_id: string;
          candidate_id: string;
          requested_by: string | null;
          overall_score: number;
          match_percentage: number;
          category_scores: Json;
          strengths: string[];
          weaknesses: string[];
          recommendations: string[];
          provider: string;
          provider_model: string;
          summary?: string | null;
          verdict?: string | null;
          reasons?: string[] | null;
          prospects?: string | null;
          credits_to_charge?: number;
          tokens_in?: number | null;
          tokens_out?: number | null;
        };
        Returns: void;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
