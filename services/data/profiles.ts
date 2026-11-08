import { readUserFacingApiErrorMessage } from "@/lib/api/user-facing-errors";

export type ProfileLite = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "hr" | "recruiter";
};

const PROFILE_IDS_CHUNK_SIZE = 200;

function mapProfile(value: unknown): ProfileLite | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { id?: unknown; name?: unknown; email?: unknown; role?: unknown };
  if (typeof row.id !== "string" || !row.id) return null;
  const role = row.role === "admin" || row.role === "hr" || row.role === "recruiter" ? row.role : "recruiter";
  return {
    id: row.id,
    name: String(row.name ?? ""),
    email: String(row.email ?? ""),
    role,
  };
}

export async function getProfilesByIds(ids: string[]): Promise<Map<string, ProfileLite>> {
  const byId = new Map<string, ProfileLite>();
  const unique = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
  if (unique.length === 0) return byId;

  for (let start = 0; start < unique.length; start += PROFILE_IDS_CHUNK_SIZE) {
    const chunk = unique.slice(start, start + PROFILE_IDS_CHUNK_SIZE);
    const params = new URLSearchParams();
    params.set("ids", chunk.join(","));

    const res = await fetch(`/api/profiles?${params.toString()}`, { method: "GET", cache: "no-store" });
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(readUserFacingApiErrorMessage(json, "Не удалось загрузить сотрудников"));
    }

    const profiles = json && typeof json === "object" && Array.isArray((json as { profiles?: unknown }).profiles)
      ? (json as { profiles: unknown[] }).profiles
      : [];

    for (const value of profiles) {
      const profile = mapProfile(value);
      if (profile) byId.set(profile.id, profile);
    }
  }

  return byId;
}
