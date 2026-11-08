import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireCandidateAccess, requireCompanyContext } from "@/lib/access/company-guards";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const QuerySchema = z.object({
  candidateId: z.string().min(1),
});

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;

    const parsed = QuerySchema.safeParse({
      candidateId: req.nextUrl.searchParams.get("candidateId"),
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_QUERY" }, { status: 400 });
    }

    const { candidateId } = parsed.data;

    const accessRes = await requireCandidateAccess(admin, ctx, candidateId);
    if (!accessRes.ok) return accessRes.response;

    const { data: cand, error: candErr } = await admin
      .from("candidates")
      .select("id,resume_url,resume_file_name")
      .eq("id", candidateId)
      .maybeSingle();
    if (candErr) return NextResponse.json({ error: "CANDIDATE_LOOKUP_FAILED" }, { status: 500 });
    if (!cand) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    if (!cand.resume_url) return NextResponse.json({ error: "NO_RESUME" }, { status: 404 });

    const fileName = resolveDownloadFileName(cand.resume_url, cand.resume_file_name);

    if (cand.resume_url.startsWith("resumes/")) {
      const { data, error } = await admin.storage.from("resumes").download(normalizeResumePath(cand.resume_url));
      if (error || !data) {
        return NextResponse.json({ error: "RESUME_DOWNLOAD_FAILED" }, { status: 500 });
      }

      return new NextResponse(data.stream(), {
        status: 200,
        headers: buildDownloadHeaders({
          contentType: data.type || "application/octet-stream",
          contentLength: data.size > 0 ? String(data.size) : null,
          fileName,
        }),
      });
    }

    const sourceUrl = resolveResumeSourceUrl(req, cand.resume_url);
    if (!sourceUrl) {
      return NextResponse.json({ error: "UNSUPPORTED_RESUME_URL" }, { status: 400 });
    }

    const upstream = await fetch(sourceUrl, { redirect: "follow" });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: "RESUME_DOWNLOAD_FAILED" }, { status: 502 });
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers: buildDownloadHeaders({
        contentType: upstream.headers.get("content-type"),
        contentLength: upstream.headers.get("content-length"),
        fileName,
      }),
    });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

function buildDownloadHeaders({
  contentLength,
  contentType,
  fileName,
}: {
  contentType: string | null;
  contentLength: string | null;
  fileName: string;
}): Headers {
  const headers = new Headers();
  headers.set("Content-Disposition", buildContentDisposition(fileName));
  headers.set("Content-Type", contentType || "application/octet-stream");
  headers.set("Cache-Control", "no-store");
  if (contentLength) {
    headers.set("Content-Length", contentLength);
  }
  return headers;
}

function buildContentDisposition(fileName: string): string {
  const asciiFileName = fileName.replace(/[^\x20-\x7E]+/g, "_").replace(/["\\]/g, "_") || "resume";
  const encodedFileName = encodeURIComponent(fileName);
  return `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodedFileName}`;
}

function resolveDownloadFileName(resumeUrl: string, resumeFileName: string | null): string {
  const trimmed = resumeFileName?.trim();
  if (trimmed) return trimmed;

  const normalized = normalizeResumePath(resumeUrl);
  const lastSegment = normalized.split("/").filter(Boolean).at(-1);
  return lastSegment && lastSegment.trim() ? lastSegment.trim() : "resume";
}

function resolveResumeSourceUrl(req: NextRequest, resumeUrl: string): string | null {
  if (resumeUrl.startsWith("/")) {
    return new URL(resumeUrl, req.nextUrl.origin).toString();
  }
  if (resumeUrl.startsWith("http://") || resumeUrl.startsWith("https://")) {
    return resumeUrl;
  }
  return null;
}

function normalizeResumePath(resumeUrl: string): string {
  return resumeUrl.startsWith("resumes/") ? resumeUrl.slice("resumes/".length) : resumeUrl;
}
