export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/**
 * Minimal Supabase Database types used in this codebase.
 *
 * Later we can replace this with generated types via Supabase (recommended).
 */
export type Database = {
  public: {
    Tables: {
      companies: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          website: string | null;
          logo_url: string | null;
          industry: string | null;
          size: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          website?: string | null;
          logo_url?: string | null;
          industry?: string | null;
          size?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          website?: string | null;
          logo_url?: string | null;
          industry?: string | null;
          size?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          name: string;
          avatar_url: string | null;
          company_id: string | null;
          role: "admin" | "hr" | "recruiter";
          onboarding_completed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          name: string;
          avatar_url?: string | null;
          company_id?: string | null;
          role: "admin" | "hr" | "recruiter";
          onboarding_completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          email?: string;
          name?: string;
          avatar_url?: string | null;
          company_id?: string | null;
          role?: "admin" | "hr" | "recruiter";
          onboarding_completed?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      marketing_visitors: {
        Row: {
          visitor_id: string;
          landing_path: string | null;
          referrer: string | null;
          first_utm_source: string | null;
          first_utm_medium: string | null;
          first_utm_campaign: string | null;
          first_utm_term: string | null;
          first_utm_content: string | null;
          first_gclid: string | null;
          first_fbclid: string | null;
          first_msclkid: string | null;
          last_utm_source: string | null;
          last_utm_medium: string | null;
          last_utm_campaign: string | null;
          last_utm_term: string | null;
          last_utm_content: string | null;
          last_gclid: string | null;
          last_fbclid: string | null;
          last_msclkid: string | null;
          visit_count: number;
          first_seen_at: string;
          last_seen_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          visitor_id: string;
          landing_path?: string | null;
          referrer?: string | null;
          first_utm_source?: string | null;
          first_utm_medium?: string | null;
          first_utm_campaign?: string | null;
          first_utm_term?: string | null;
          first_utm_content?: string | null;
          first_gclid?: string | null;
          first_fbclid?: string | null;
          first_msclkid?: string | null;
          last_utm_source?: string | null;
          last_utm_medium?: string | null;
          last_utm_campaign?: string | null;
          last_utm_term?: string | null;
          last_utm_content?: string | null;
          last_gclid?: string | null;
          last_fbclid?: string | null;
          last_msclkid?: string | null;
          visit_count?: number;
          first_seen_at?: string;
          last_seen_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["marketing_visitors"]["Insert"]>;
        Relationships: [];
      };
      marketing_visit_events: {
        Row: {
          id: number;
          visitor_id: string;
          landing_path: string | null;
          referrer: string | null;
          first_utm_source: string | null;
          first_utm_medium: string | null;
          first_utm_campaign: string | null;
          first_utm_term: string | null;
          first_utm_content: string | null;
          first_gclid: string | null;
          first_fbclid: string | null;
          first_msclkid: string | null;
          last_utm_source: string | null;
          last_utm_medium: string | null;
          last_utm_campaign: string | null;
          last_utm_term: string | null;
          last_utm_content: string | null;
          last_gclid: string | null;
          last_fbclid: string | null;
          last_msclkid: string | null;
          seen_at: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          visitor_id: string;
          landing_path?: string | null;
          referrer?: string | null;
          first_utm_source?: string | null;
          first_utm_medium?: string | null;
          first_utm_campaign?: string | null;
          first_utm_term?: string | null;
          first_utm_content?: string | null;
          first_gclid?: string | null;
          first_fbclid?: string | null;
          first_msclkid?: string | null;
          last_utm_source?: string | null;
          last_utm_medium?: string | null;
          last_utm_campaign?: string | null;
          last_utm_term?: string | null;
          last_utm_content?: string | null;
          last_gclid?: string | null;
          last_fbclid?: string | null;
          last_msclkid?: string | null;
          seen_at?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["marketing_visit_events"]["Insert"]>;
        Relationships: [];
      };
      marketing_conversions: {
        Row: {
          id: string;
          user_id: string;
          company_id: string | null;
          visitor_id: string | null;
          landing_path: string | null;
          referrer: string | null;
          first_utm_source: string | null;
          first_utm_medium: string | null;
          first_utm_campaign: string | null;
          first_utm_term: string | null;
          first_utm_content: string | null;
          first_gclid: string | null;
          first_fbclid: string | null;
          first_msclkid: string | null;
          last_utm_source: string | null;
          last_utm_medium: string | null;
          last_utm_campaign: string | null;
          last_utm_term: string | null;
          last_utm_content: string | null;
          last_gclid: string | null;
          last_fbclid: string | null;
          last_msclkid: string | null;
          signed_up_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          company_id?: string | null;
          visitor_id?: string | null;
          landing_path?: string | null;
          referrer?: string | null;
          first_utm_source?: string | null;
          first_utm_medium?: string | null;
          first_utm_campaign?: string | null;
          first_utm_term?: string | null;
          first_utm_content?: string | null;
          first_gclid?: string | null;
          first_fbclid?: string | null;
          first_msclkid?: string | null;
          last_utm_source?: string | null;
          last_utm_medium?: string | null;
          last_utm_campaign?: string | null;
          last_utm_term?: string | null;
          last_utm_content?: string | null;
          last_gclid?: string | null;
          last_fbclid?: string | null;
          last_msclkid?: string | null;
          signed_up_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["marketing_conversions"]["Insert"]>;
        Relationships: [];
      };
      first_ai_onboarding_states: {
        Row: {
          completed_at: string | null;
          created_at: string;
          dismissed_at: string | null;
          hh_oauth_error_at: string | null;
          hh_started_at: string | null;
          result_opened_at: string | null;
          result_acknowledged_at: string | null;
          started_path: "manual" | "hh" | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          dismissed_at?: string | null;
          hh_oauth_error_at?: string | null;
          hh_started_at?: string | null;
          result_opened_at?: string | null;
          result_acknowledged_at?: string | null;
          started_path?: "manual" | "hh" | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          dismissed_at?: string | null;
          hh_oauth_error_at?: string | null;
          hh_started_at?: string | null;
          result_opened_at?: string | null;
          result_acknowledged_at?: string | null;
          started_path?: "manual" | "hh" | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "first_ai_onboarding_states_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      vacancies: {
        Row: {
          id: string;
          title: string;
          description: string;
          requirements: string[];
          responsibilities: string[];
          salary_min: number | null;
          salary_max: number | null;
          salary_currency: string;
          location: string;
          employment_type: "full-time" | "part-time" | "contract" | "internship";
          experience_level: "trainee" | "junior" | "middle" | "senior" | "lead";
          status: "draft" | "active" | "paused" | "closed";
          department: string | null;
          hiring_manager: string | null;
          headcount: number;
          work_schedule: string | null;
          employment_form: "tk" | "gph" | "self-employed" | "ip" | "other" | null;
          employment_forms: ("tk" | "gph" | "self-employed" | "ip" | "other")[];
          salary_period: "month" | "hour" | "shift";
          salary_tax: "gross" | "net" | null;
          bonus_text: string | null;
          benefits_text: string | null;
          probation_months: number | null;
          travel_percent: number | null;
          mandatory_requirements_text: string | null;
          hiring_process_text: string | null;
          company_id: string;
          created_by: string;
          hhru_vacancy_id: string | null;
          hh_source_fingerprint: string | null;
          closed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description: string;
          requirements: string[];
          responsibilities: string[];
          salary_min?: number | null;
          salary_max?: number | null;
          salary_currency?: string;
          location: string;
          employment_type: "full-time" | "part-time" | "contract" | "internship";
          experience_level: "trainee" | "junior" | "middle" | "senior" | "lead";
          status?: "draft" | "active" | "paused" | "closed";
          department?: string | null;
          hiring_manager?: string | null;
          headcount?: number;
          work_schedule?: string | null;
          employment_form?: "tk" | "gph" | "self-employed" | "ip" | "other" | null;
          employment_forms?: ("tk" | "gph" | "self-employed" | "ip" | "other")[];
          salary_period?: "month" | "hour" | "shift";
          salary_tax?: "gross" | "net" | null;
          bonus_text?: string | null;
          benefits_text?: string | null;
          probation_months?: number | null;
          travel_percent?: number | null;
          mandatory_requirements_text?: string | null;
          hiring_process_text?: string | null;
          company_id: string;
          created_by: string;
          hhru_vacancy_id?: string | null;
          hh_source_fingerprint?: string | null;
          closed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["vacancies"]["Insert"], "company_id" | "created_by">> & {
          company_id?: string;
          created_by?: string;
        };
        Relationships: [];
      };
      candidates: {
        Row: {
          id: string;
          name: string;
          position: string;
          vacancy_id: string;
          created_by: string;
          resume_url: string | null;
          resume_text: string | null;
          resume_file_name: string | null;
          resume_file_size: number | null;
          desired_salary_text: string | null;
          desired_salary_amount: number | null;
          desired_salary_currency: string | null;
          desired_salary_source: "hh" | "ai_parser" | "regex" | null;
          avatar_url: string | null;
          ai_score: number | null;
          match_percentage: number | null;
          status: "new" | "reviewing" | "security-check" | "interview-scheduled" | "interviewed" | "offer" | "hired" | "rejected";
          source: "hh.ru" | "manual" | "referral" | "other";
          comment: string | null;
          applied_at: string;
          hhru_resume_id: string | null;
          hh_auto_survey_text: string | null;
          hh_source_fingerprint: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          position: string;
          vacancy_id: string;
          created_by: string;
          resume_url?: string | null;
          resume_text?: string | null;
          resume_file_name?: string | null;
          resume_file_size?: number | null;
          desired_salary_text?: string | null;
          desired_salary_amount?: number | null;
          desired_salary_currency?: string | null;
          desired_salary_source?: "hh" | "ai_parser" | "regex" | null;
          avatar_url?: string | null;
          ai_score?: number | null;
          match_percentage?: number | null;
          status?: "new" | "reviewing" | "security-check" | "interview-scheduled" | "interviewed" | "offer" | "hired" | "rejected";
          source?: "hh.ru" | "manual" | "referral" | "other";
          comment?: string | null;
          applied_at?: string;
          hhru_resume_id?: string | null;
          hh_auto_survey_text?: string | null;
          hh_source_fingerprint?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["candidates"]["Insert"]>;
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
          used_ocr: boolean;
          provider_model: string | null;
          tokens_in: number | null;
          tokens_out: number | null;
          created_at: string;
          updated_at: string;
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
          used_ocr?: boolean;
          provider_model?: string | null;
          tokens_in?: number | null;
          tokens_out?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ai_analyses"]["Insert"]>;
        Relationships: [];
      };
      ai_usage_events: {
        Row: {
          id: string;
          company_id: string;
          user_id: string;
          candidate_id: string | null;
          request_id: string;
          task: "candidate_profile_parse";
          provider: "deepseek";
          model: string;
          status: "success" | "fallback" | "failed";
          fallback_reason: string | null;
          attempts: number;
          tokens_in: number | null;
          tokens_out: number | null;
          duration_ms: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          user_id: string;
          candidate_id?: string | null;
          request_id: string;
          task: "candidate_profile_parse";
          provider: "deepseek";
          model: string;
          status: "success" | "fallback" | "failed";
          fallback_reason?: string | null;
          attempts: number;
          tokens_in?: number | null;
          tokens_out?: number | null;
          duration_ms: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ai_usage_events"]["Insert"]>;
        Relationships: [];
      };
      interviews: {
        Row: {
          id: string;
          company_id: string;
          candidate_id: string;
          vacancy_id: string;
          scheduled_at: string;
          duration_minutes: number;
          type: "phone" | "video" | "in-person" | "technical";
          status: "scheduled" | "completed" | "cancelled";
          interviewer_ids: string[];
          meeting_url: string | null;
          location: string | null;
          notes: string | null;
          completion_note: string | null;
          cancel_note: string | null;
          completed_at: string | null;
          cancelled_at: string | null;
          external_provider: "google_calendar" | null;
          external_event_id: string | null;
          sync_status: "not_connected" | "pending" | "synced" | "failed";
          sync_error: string | null;
          last_synced_at: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          candidate_id: string;
          vacancy_id: string;
          scheduled_at: string;
          duration_minutes: number;
          type: "phone" | "video" | "in-person" | "technical";
          status?: "scheduled" | "completed" | "cancelled";
          interviewer_ids: string[];
          meeting_url?: string | null;
          location?: string | null;
          notes?: string | null;
          completion_note?: string | null;
          cancel_note?: string | null;
          completed_at?: string | null;
          cancelled_at?: string | null;
          external_provider?: "google_calendar" | null;
          external_event_id?: string | null;
          sync_status?: "not_connected" | "pending" | "synced" | "failed";
          sync_error?: string | null;
          last_synced_at?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["interviews"]["Insert"]>;
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
          pinned_at: string | null;
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
          pinned_at?: string | null;
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
      platform_admins: {
        Row: { user_id: string; created_at: string };
        Insert: { user_id: string; created_at?: string };
        Update: { user_id?: string; created_at?: string };
        Relationships: [];
      };
      company_credits: {
        Row: { company_id: string; balance: number; reserved: number; updated_at: string };
        Insert: { company_id: string; balance?: number; reserved?: number; updated_at?: string };
        Update: { company_id?: string; balance?: number; reserved?: number; updated_at?: string };
        Relationships: [];
      };
      company_plans: {
        Row: {
          company_id: string;
          current_plan: "trial" | "starter" | "professional" | "enterprise";
          expires_at: string | null;
          trial_expires_at: string | null;
          intended_plan: "starter" | "professional" | "enterprise" | null;
          period_start: string | null;
          period_end: string | null;
          robokassa_inv_id: string | null;
          recurring_mandate_inv_id: string | null;
          auto_renew: boolean;
          scheduled_plan: "starter" | "professional" | "enterprise" | null;
          scheduled_plan_effective_at: string | null;
          scheduled_payment_id: string | null;
          updated_at: string;
        };
        Insert: {
          company_id: string;
          current_plan?: "trial" | "starter" | "professional" | "enterprise";
          expires_at?: string | null;
          trial_expires_at?: string | null;
          intended_plan?: "starter" | "professional" | "enterprise" | null;
          period_start?: string | null;
          period_end?: string | null;
          robokassa_inv_id?: string | null;
          recurring_mandate_inv_id?: string | null;
          auto_renew?: boolean;
          scheduled_plan?: "starter" | "professional" | "enterprise" | null;
          scheduled_plan_effective_at?: string | null;
          scheduled_payment_id?: string | null;
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          current_plan?: "trial" | "starter" | "professional" | "enterprise";
          expires_at?: string | null;
          trial_expires_at?: string | null;
          intended_plan?: "starter" | "professional" | "enterprise" | null;
          period_start?: string | null;
          period_end?: string | null;
          robokassa_inv_id?: string | null;
          recurring_mandate_inv_id?: string | null;
          auto_renew?: boolean;
          scheduled_plan?: "starter" | "professional" | "enterprise" | null;
          scheduled_plan_effective_at?: string | null;
          scheduled_payment_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      billing_plan_change_requests: {
        Row: {
          id: string;
          company_id: string;
          requested_by: string;
          current_plan: "trial" | "starter" | "professional" | "enterprise";
          target_plan: "starter" | "professional" | "enterprise";
          request_kind: "upgrade_to_enterprise" | "enterprise_exit" | "enterprise_terms_change" | "manual_plan_change";
          source: "landing" | "settings" | "admin";
          status: "submitted" | "in_review" | "contacted" | "approved" | "applied" | "rejected" | "canceled";
          user_message: string | null;
          admin_note: string | null;
          public_response: string | null;
          handled_by: string | null;
          handled_at: string | null;
          approved_at: string | null;
          applied_at: string | null;
          rejected_at: string | null;
          canceled_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          requested_by: string;
          current_plan: "trial" | "starter" | "professional" | "enterprise";
          target_plan: "starter" | "professional" | "enterprise";
          request_kind: "upgrade_to_enterprise" | "enterprise_exit" | "enterprise_terms_change" | "manual_plan_change";
          source: "landing" | "settings" | "admin";
          status?: "submitted" | "in_review" | "contacted" | "approved" | "applied" | "rejected" | "canceled";
          user_message?: string | null;
          admin_note?: string | null;
          public_response?: string | null;
          handled_by?: string | null;
          handled_at?: string | null;
          approved_at?: string | null;
          applied_at?: string | null;
          rejected_at?: string | null;
          canceled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          requested_by?: string;
          current_plan?: "trial" | "starter" | "professional" | "enterprise";
          target_plan?: "starter" | "professional" | "enterprise";
          request_kind?: "upgrade_to_enterprise" | "enterprise_exit" | "enterprise_terms_change" | "manual_plan_change";
          source?: "landing" | "settings" | "admin";
          status?: "submitted" | "in_review" | "contacted" | "approved" | "applied" | "rejected" | "canceled";
          user_message?: string | null;
          admin_note?: string | null;
          public_response?: string | null;
          handled_by?: string | null;
          handled_at?: string | null;
          approved_at?: string | null;
          applied_at?: string | null;
          rejected_at?: string | null;
          canceled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      enterprise_agreements: {
        Row: {
          id: string;
          company_id: string;
          source_request_id: string | null;
          replaces_agreement_id: string | null;
          ended_by_request_id: string | null;
          status: "draft" | "pending_payment" | "active" | "ended" | "canceled";
          starts_at: string;
          ends_at: string | null;
          is_open_ended: boolean;
          credits_limit: number | null;
          terms_summary: string | null;
          internal_note: string | null;
          created_by: string;
          activated_by: string | null;
          activated_at: string | null;
          ended_by: string | null;
          ended_at: string | null;
          ended_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          source_request_id?: string | null;
          replaces_agreement_id?: string | null;
          ended_by_request_id?: string | null;
          status?: "draft" | "pending_payment" | "active" | "ended" | "canceled";
          starts_at: string;
          ends_at?: string | null;
          is_open_ended?: boolean;
          credits_limit?: number | null;
          terms_summary?: string | null;
          internal_note?: string | null;
          created_by: string;
          activated_by?: string | null;
          activated_at?: string | null;
          ended_by?: string | null;
          ended_at?: string | null;
          ended_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          source_request_id?: string | null;
          replaces_agreement_id?: string | null;
          ended_by_request_id?: string | null;
          status?: "draft" | "pending_payment" | "active" | "ended" | "canceled";
          starts_at?: string;
          ends_at?: string | null;
          is_open_ended?: boolean;
          credits_limit?: number | null;
          terms_summary?: string | null;
          internal_note?: string | null;
          created_by?: string;
          activated_by?: string | null;
          activated_at?: string | null;
          ended_by?: string | null;
          ended_at?: string | null;
          ended_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      billing_manual_invoices: {
        Row: {
          id: string;
          company_id: string;
          request_id: string | null;
          agreement_id: string | null;
          provider: "robokassa";
          provider_invoice_id: string | null;
          provider_invoice_url: string | null;
          provider_status: string | null;
          amount: number;
          currency: string;
          description: string;
          payer_email: string | null;
          service_period_start: string | null;
          service_period_end: string | null;
          status: "draft" | "issued" | "paid" | "expired" | "canceled" | "refunded" | "requires_review";
          fiscal_receipt: Json | null;
          provider_payload: Json | null;
          created_by: string;
          issued_at: string | null;
          paid_at: string | null;
          expires_at: string | null;
          canceled_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          request_id?: string | null;
          agreement_id?: string | null;
          provider?: "robokassa";
          provider_invoice_id?: string | null;
          provider_invoice_url?: string | null;
          provider_status?: string | null;
          amount: number;
          currency?: string;
          description: string;
          payer_email?: string | null;
          service_period_start?: string | null;
          service_period_end?: string | null;
          status?: "draft" | "issued" | "paid" | "expired" | "canceled" | "refunded" | "requires_review";
          fiscal_receipt?: Json | null;
          provider_payload?: Json | null;
          created_by: string;
          issued_at?: string | null;
          paid_at?: string | null;
          expires_at?: string | null;
          canceled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          request_id?: string | null;
          agreement_id?: string | null;
          provider?: "robokassa";
          provider_invoice_id?: string | null;
          provider_invoice_url?: string | null;
          provider_status?: string | null;
          amount?: number;
          currency?: string;
          description?: string;
          payer_email?: string | null;
          service_period_start?: string | null;
          service_period_end?: string | null;
          status?: "draft" | "issued" | "paid" | "expired" | "canceled" | "refunded" | "requires_review";
          fiscal_receipt?: Json | null;
          provider_payload?: Json | null;
          created_by?: string;
          issued_at?: string | null;
          paid_at?: string | null;
          expires_at?: string | null;
          canceled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          company_id: string;
          plan: "starter" | "professional" | "enterprise";
          amount: number;
          currency: string;
          status: "pending" | "completed" | "failed" | "refunded" | "requires_review";
          provider: string;
          provider_id: string | null;
          credits_granted: number | null;
          created_at: string;
          completed_at: string | null;
          checkout_expires_at: string | null;
          inv_id: number;
          period_start: string | null;
          period_end: string | null;
          is_recurring: boolean;
          parent_inv_id: number | null;
          activate_auto_renew: boolean;
          recurring_mandate_activated: boolean;
          scheduled_change_kind: "paid_downgrade" | null;
          scheduled_source_plan: "starter" | "professional" | "enterprise" | null;
          scheduled_source_period_end: string | null;
          scheduled_activation_at: string | null;
          failed_at: string | null;
          fail_reason: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          plan: "starter" | "professional" | "enterprise";
          amount: number;
          currency?: string;
          status?: "pending" | "completed" | "failed" | "refunded" | "requires_review";
          provider?: string;
          provider_id?: string | null;
          credits_granted?: number | null;
          created_at?: string;
          completed_at?: string | null;
          checkout_expires_at?: string | null;
          inv_id?: number;
          period_start?: string | null;
          period_end?: string | null;
          is_recurring?: boolean;
          parent_inv_id?: number | null;
          activate_auto_renew?: boolean;
          recurring_mandate_activated?: boolean;
          scheduled_change_kind?: "paid_downgrade" | null;
          scheduled_source_plan?: "starter" | "professional" | "enterprise" | null;
          scheduled_source_period_end?: string | null;
          scheduled_activation_at?: string | null;
          failed_at?: string | null;
          fail_reason?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Insert"]>;
        Relationships: [];
      };
      credit_topup_payments: {
        Row: {
          id: string;
          company_id: string;
          credits: number;
          amount: number;
          currency: string;
          status: "pending" | "completed" | "failed" | "refunded" | "requires_review";
          provider: string;
          provider_id: string | null;
          fiscal_receipt: Json | null;
          provider_payload: Json | null;
          inv_id: number;
          checkout_expires_at: string | null;
          created_at: string;
          completed_at: string | null;
          failed_at: string | null;
          fail_reason: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          credits: number;
          amount: number;
          currency?: string;
          status?: "pending" | "completed" | "failed" | "refunded" | "requires_review";
          provider?: string;
          provider_id?: string | null;
          fiscal_receipt?: Json | null;
          provider_payload?: Json | null;
          inv_id?: number;
          checkout_expires_at?: string | null;
          created_at?: string;
          completed_at?: string | null;
          failed_at?: string | null;
          fail_reason?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["credit_topup_payments"]["Insert"]>;
        Relationships: [];
      };
      leads: {
        Row: {
          id: string;
          full_name: string;
          email: string;
          phone: string;
          company: string;
          company_size: string | null;
          message: string | null;
          requested_plan: "starter" | "professional" | "enterprise";
          status: "new" | "contacted" | "qualified" | "rejected";
          handled_by: string | null;
          handled_at: string | null;
          decision_note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          full_name: string;
          email: string;
          phone: string;
          company: string;
          company_size?: string | null;
          message?: string | null;
          requested_plan?: "starter" | "professional" | "enterprise";
          status?: "new" | "contacted" | "qualified" | "rejected";
          handled_by?: string | null;
          handled_at?: string | null;
          decision_note?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["leads"]["Insert"]>;
        Relationships: [];
      };
      telegram_user_links: {
        Row: { user_id: string; chat_id: number; connected_at: string; last_seen_at: string | null };
        Insert: { user_id: string; chat_id: number; connected_at?: string; last_seen_at?: string | null };
        Update: Partial<Database["public"]["Tables"]["telegram_user_links"]["Insert"]>;
        Relationships: [];
      };
      telegram_connect_tokens: {
        Row: { token: string; user_id: string; expires_at: string; used_at: string | null; created_at: string };
        Insert: { token: string; user_id: string; expires_at: string; used_at?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["telegram_connect_tokens"]["Insert"]>;
        Relationships: [];
      };
      telegram_notification_settings: {
        Row: { user_id: string; telegram_enabled: boolean; created_at: string; updated_at: string };
        Insert: { user_id: string; telegram_enabled?: boolean; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["telegram_notification_settings"]["Insert"]>;
        Relationships: [];
      };
      email_notification_settings: {
        Row: { user_id: string; email_enabled: boolean; created_at: string; updated_at: string };
        Insert: { user_id: string; email_enabled?: boolean; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["email_notification_settings"]["Insert"]>;
        Relationships: [];
      };
      trial_email_usage: {
        Row: {
          email: string;
          first_user_id: string;
          company_id: string | null;
          first_used_at: string;
        };
        Insert: {
          email: string;
          first_user_id: string;
          company_id?: string | null;
          first_used_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["trial_email_usage"]["Insert"]>;
        Relationships: [];
      };
      signup_provisioning_audit: {
        Row: {
          id: string;
          user_id: string;
          email: string;
          company_id: string;
          intended_plan: "starter" | "professional";
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          email: string;
          company_id: string;
          intended_plan: "starter" | "professional";
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["signup_provisioning_audit"]["Insert"]>;
        Relationships: [];
      };
      tariff_change_requests: {
        Row: {
          id: string;
          company_id: string;
          requested_by: string;
          from_plan: "starter" | "professional" | "enterprise";
          to_plan: "starter" | "professional" | "enterprise";
          status: "pending" | "approved" | "rejected" | "cancelled";
          message: string | null;
          decision_note: string | null;
          decided_by: string | null;
          decided_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          requested_by: string;
          from_plan: "starter" | "professional" | "enterprise";
          to_plan: "starter" | "professional" | "enterprise";
          status?: "pending" | "approved" | "rejected" | "cancelled";
          message?: string | null;
          decision_note?: string | null;
          decided_by?: string | null;
          decided_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tariff_change_requests"]["Insert"]>;
        Relationships: [];
      };
      credit_reservations: {
        Row: {
          id: string;
          company_id: string;
          amount: number;
          reference_type: string;
          reference_id: string;
          status: "reserved" | "captured" | "released";
          reserved_at: string;
          captured_at: string | null;
          released_at: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          amount: number;
          reference_type: string;
          reference_id: string;
          status?: "reserved" | "captured" | "released";
          reserved_at?: string;
          captured_at?: string | null;
          released_at?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["credit_reservations"]["Insert"]>;
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
      feedback: {
        Row: {
          id: string;
          company_id: string;
          user_id: string;
          author_name: string | null;
          author_email: string;
          author_role: "admin" | "hr" | "recruiter";
          type: "idea" | "missing_feature" | "usability" | "question" | "other";
          sections: string[];
          message: string;
          status: "new" | "reviewed" | "in_progress" | "closed" | "deferred";
          admin_class: "bug" | "feature" | "ux" | "question" | "billing" | "data" | "integration" | "other" | null;
          admin_note: string | null;
          external_url: string | null;
          source_url: string | null;
          user_agent: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
          ai_summary: string | null;
          ai_labels: Json | null;
          ai_processed_at: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          user_id: string;
          author_name?: string | null;
          author_email: string;
          author_role: "admin" | "hr" | "recruiter";
          type: "idea" | "missing_feature" | "usability" | "question" | "other";
          sections: string[];
          message: string;
          status?: "new" | "reviewed" | "in_progress" | "closed" | "deferred";
          admin_class?: "bug" | "feature" | "ux" | "question" | "billing" | "data" | "integration" | "other" | null;
          admin_note?: string | null;
          external_url?: string | null;
          source_url?: string | null;
          user_agent?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          ai_summary?: string | null;
          ai_labels?: Json | null;
          ai_processed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["feedback"]["Insert"]>;
        Relationships: [];
      };
      integrations: {
        Row: {
          id: string;
          company_id: string;
          provider: "hh.ru" | "google_calendar" | "slack";
          is_active: boolean;
          access_token: string | null;
          refresh_token: string | null;
          token_expires_at: string | null;
          settings: Json | null;
          connected_at: string;
          last_synced_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          provider: "hh.ru" | "google_calendar" | "slack";
          is_active?: boolean;
          access_token?: string | null;
          refresh_token?: string | null;
          token_expires_at?: string | null;
          settings?: Json | null;
          connected_at?: string;
          last_synced_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["integrations"]["Insert"]>;
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
    };
    Views: Record<string, never>;
    Functions: {
      list_dashboard_activity: {
        Args: {
          p_company_id: string;
          p_user_id: string;
          p_role: string;
          p_type: string;
          p_limit: number;
          p_offset: number;
        };
        Returns: {
          activity_id: string;
          activity_kind: string;
          occurred_at: string;
          actor_id: string | null;
          actor_name: string | null;
          actor_email: string | null;
          title: string;
          description: string | null;
          credit_delta: number | null;
          entity_type: string | null;
          entity_id: string | null;
          entity_name: string | null;
        }[];
      };
      count_dashboard_activity: {
        Args: {
          p_company_id: string;
          p_user_id: string;
          p_role: string;
          p_type: string;
        };
        Returns: number;
      };
      enqueue_ai_job_with_credit_reserve: {
        Args: {
          p_company_id: string;
          p_candidate_id: string;
          p_requested_by: string;
          p_credits_to_reserve?: number;
        };
        Returns: Database["public"]["Tables"]["jobs_ai"]["Row"];
      };
      create_interview_mvp: {
        Args: {
          p_company_id: string;
          p_candidate_id: string;
          p_vacancy_id: string;
          p_scheduled_at: string;
          p_duration_minutes: number;
          p_type: string;
          p_interviewer_ids: string[];
          p_meeting_url: string | null;
          p_location: string | null;
          p_notes: string | null;
          p_created_by: string;
          p_allow_conflicts?: boolean;
        };
        Returns: Database["public"]["Tables"]["interviews"]["Row"];
      };
      update_interview_mvp: {
        Args: {
          p_interview_id: string;
          p_company_id: string;
          p_candidate_id: string;
          p_vacancy_id: string;
          p_scheduled_at: string;
          p_duration_minutes: number;
          p_type: string;
          p_interviewer_ids: string[];
          p_meeting_url: string | null;
          p_location: string | null;
          p_notes: string | null;
          p_expected_updated_at: string;
          p_allow_conflicts?: boolean;
        };
        Returns: Database["public"]["Tables"]["interviews"]["Row"] | null;
      };
      cancel_interview_mvp: {
        Args: {
          p_interview_id: string;
          p_company_id: string;
          p_cancel_note: string | null;
          p_expected_updated_at: string;
        };
        Returns: Database["public"]["Tables"]["interviews"]["Row"] | null;
      };
      complete_interview_mvp: {
        Args: {
          p_interview_id: string;
          p_company_id: string;
          p_completion_note: string | null;
          p_expected_updated_at: string;
        };
        Returns: Database["public"]["Tables"]["interviews"]["Row"] | null;
      };
      ensure_ai_job_reservation: {
        Args: {
          p_job_id: string;
          p_company_id: string;
          p_requested_by: string | null;
          p_credits_to_reserve?: number;
        };
        Returns: boolean;
      };
      release_ai_job_reservation: {
        Args: { p_job_id: string; reason?: string | null };
        Returns: void;
      };
      claim_next_ai_job: {
        Args: { worker_id: string };
        Returns: Database["public"]["Tables"]["jobs_ai"]["Row"] | null;
      };
      claim_due_hh_integration: {
        Args: { worker_id: string; cutoff: string; lease_seconds?: number };
        Returns: Database["public"]["Tables"]["integrations_accounts"]["Row"] | null;
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
      record_marketing_visit: {
        Args: {
          p_visitor_id: string;
          p_landing_path: string | null;
          p_referrer: string | null;
          p_first_utm_source: string | null;
          p_first_utm_medium: string | null;
          p_first_utm_campaign: string | null;
          p_first_utm_term: string | null;
          p_first_utm_content: string | null;
          p_first_gclid: string | null;
          p_first_fbclid: string | null;
          p_first_msclkid: string | null;
          p_last_utm_source: string | null;
          p_last_utm_medium: string | null;
          p_last_utm_campaign: string | null;
          p_last_utm_term: string | null;
          p_last_utm_content: string | null;
          p_last_gclid: string | null;
          p_last_fbclid: string | null;
          p_last_msclkid: string | null;
          p_seen_at?: string;
          p_record_event?: boolean;
        };
        Returns: void;
      };
      get_marketing_admin_report: {
        Args: {
          p_start_at: string;
          p_recent_limit?: number;
          p_recent_offset?: number;
          p_source_limit?: number;
        };
        Returns: Json;
      };
      finalize_robokassa_payment: {
        Args: {
          p_inv_id: number;
          p_provider_id: string;
          p_completed_at?: string;
        };
        Returns: {
          payment_id: string;
          company_id: string;
          plan: string;
          credits_granted: number;
          already_completed: boolean;
        }[];
      };
      finalize_credit_topup_payment: {
        Args: {
          p_inv_id: number;
          p_provider_id: string;
          p_completed_at?: string;
          p_provider_payload?: Json | null;
        };
        Returns: {
          payment_id: string;
          company_id: string;
          credits_granted: number;
          already_completed: boolean;
        }[];
      };
      create_or_reuse_credit_topup_payment: {
        Args: {
          p_company_id: string;
          p_credits: number;
          p_amount: number;
          p_currency?: string;
          p_fiscal_receipt?: Json | null;
          p_checkout_expires_at?: string;
          p_now?: string;
        };
        Returns: {
          id: string;
          company_id: string;
          inv_id: number;
          credits: number;
          amount: number;
          currency: string;
          status: "pending" | "completed" | "failed" | "refunded" | "requires_review";
          checkout_expires_at: string | null;
          fiscal_receipt: Json | null;
          reused: boolean;
        }[];
      };
      expire_pending_immediate_checkouts: {
        Args: {
          p_now?: string;
        };
        Returns: number;
      };
      activate_due_scheduled_plan_payments: {
        Args: {
          p_now?: string;
          p_company_id?: string | null;
        };
        Returns: {
          company_id: string;
          payment_id: string;
          plan: string;
          credits_granted: number;
        }[];
      };
      set_company_plan_auto_renew: {
        Args: {
          p_company_id: string;
          p_enabled: boolean;
        };
        Returns: {
          company_id: string;
          current_plan: string;
          auto_renew: boolean;
          scheduled_plan: string | null;
          scheduled_plan_effective_at: string | null;
          scheduled_payment_id: string | null;
        }[];
      };
      mark_paid_scheduled_downgrade_requires_review: {
        Args: {
          p_company_id: string;
          p_reason?: string | null;
        };
        Returns: string;
      };
      activate_enterprise_agreement: {
        Args: {
          p_agreement_id: string;
          p_actor_id: string;
          p_reason?: string | null;
        };
        Returns: {
          agreement_id: string;
          company_id: string;
          status: string;
        }[];
      };
      create_enterprise_manual_invoice_draft: {
        Args: {
          p_agreement_id: string;
          p_actor_id: string;
          p_amount: number;
          p_description: string;
          p_payer_email: string;
          p_service_period_start?: string | null;
          p_service_period_end?: string | null;
          p_fiscal_receipt?: Json | null;
        };
        Returns: {
          invoice_id: string;
          provider_invoice_id: string | null;
          agreement_id: string;
          company_id: string;
          source_request_id: string | null;
          agreement_status: string;
        }[];
      };
      create_enterprise_agreement_from_request: {
        Args: {
          p_source_request_id: string;
          p_source_request_updated_at: string;
          p_actor_id: string;
          p_starts_at: string;
          p_ends_at?: string | null;
          p_is_open_ended: boolean;
          p_credits_limit?: number | null;
          p_terms_summary: string;
          p_internal_note?: string | null;
          p_replaces_agreement_id?: string | null;
        };
        Returns: {
          id: string;
          company_id: string;
          source_request_id: string | null;
          replaces_agreement_id: string | null;
          ended_by_request_id: string | null;
          status: string;
          starts_at: string;
          ends_at: string | null;
          is_open_ended: boolean;
          credits_limit: number | null;
          terms_summary: string | null;
          internal_note: string | null;
          created_by: string;
          activated_by: string | null;
          activated_at: string | null;
          ended_by: string | null;
          ended_at: string | null;
          ended_reason: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      end_enterprise_agreement: {
        Args: {
          p_agreement_id: string;
          p_actor_id: string;
          p_reason: string;
          p_target_plan?: "starter" | "professional" | null;
          p_request_id: string;
          p_source_request_updated_at: string;
        };
        Returns: {
          agreement_id: string;
          company_id: string;
          status: string;
        }[];
      };
      qualify_company_enterprise_plan: {
        Args: {
          p_company_id: string;
          p_reason?: string | null;
        };
        Returns: boolean;
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
        };
        Returns: void;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
