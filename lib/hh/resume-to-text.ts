import "server-only";

type HhResumeToTextOptions = {
  includeRawJson?: boolean;
};

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function asIdName(v: unknown): string {
  if (!v || typeof v !== "object") return "";
  const anyV = v as any;
  const id = asString(anyV.id);
  const name = asString(anyV.name);
  return [name || id].filter(Boolean).join("").trim();
}

function asIdNameList(v: unknown): string {
  if (!Array.isArray(v)) return "";
  return v
    .map((x) => asIdName(x))
    .filter(Boolean)
    .join(", ");
}

function sanitizeForJson(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    const s = value.trim();
    return s ? s : undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    const arr = value.map((x) => sanitizeForJson(x)).filter((x) => x !== undefined);
    return arr.length ? arr : undefined;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const next = sanitizeForJson(v);
      if (next !== undefined) out[k] = next;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return undefined;
}

function joinPeriod(start: string, end: string): string {
  const s = start.trim();
  const e = end.trim();
  if (!s && !e) return "";
  return [s || "?", e || "н.в."].join("..");
}

export function hhResumeToText(resume: any, options?: HhResumeToTextOptions): string {
  if (!resume || typeof resume !== "object") return "";
  const includeRawJson = options?.includeRawJson !== false;
  const parts: string[] = [];

  const title = asString(resume.title);
  const first = asString(resume.first_name);
  const last = asString(resume.last_name);
  const middle = asString(resume.middle_name);
  const name = [last, first, middle].filter(Boolean).join(" ").trim();

  if (name) parts.push(`Имя: ${name}`);
  if (title) parts.push(`Должность: ${title}`);

  const areaName = asString((resume.area as any)?.name);
  if (areaName) parts.push(`Локация: ${areaName}`);

  const age = typeof resume.age === "number" ? String(resume.age) : "";
  if (age) parts.push(`Возраст: ${age}`);

  const salaryAmount = typeof resume.salary?.amount === "number" ? String(resume.salary.amount) : "";
  const salaryCurrency = asString(resume.salary?.currency);
  if (salaryAmount || salaryCurrency) parts.push(`Ожидаемая зарплата: ${[salaryAmount, salaryCurrency].filter(Boolean).join(" ")}`.trim());

  const totalMonths = typeof resume.total_experience?.months === "number" ? resume.total_experience.months : null;
  if (totalMonths !== null) parts.push(`Общий опыт (мес): ${totalMonths}`);

  const scheduleName = asIdName(resume.schedule);
  if (scheduleName) parts.push(`График: ${scheduleName}`);

  const employmentName = asIdName(resume.employment);
  if (employmentName) parts.push(`Тип занятости: ${employmentName}`);

  const workFormat = asIdNameList(resume.work_format);
  if (workFormat) parts.push(`Формат работы: ${workFormat}`);

  const professionalRoles = asIdNameList(resume.professional_roles);
  if (professionalRoles) parts.push(`Профроли: ${professionalRoles}`);

  const skillSet = Array.isArray(resume.skill_set) ? resume.skill_set.map((s: any) => asString(s)).filter(Boolean) : [];
  if (skillSet.length) parts.push(`Навыки: ${skillSet.join(", ")}`);

  const skillsText = asString(resume.skills);
  if (skillsText) parts.push(`Доп. навыки: ${skillsText}`);

  const languages = Array.isArray(resume.language) ? resume.language : [];
  if (languages.length) {
    const rows = languages
      .map((l: any) => {
        const lang = asIdName(l?.name ?? l);
        const level = asIdName(l?.level);
        return [lang, level].filter(Boolean).join(" — ");
      })
      .filter(Boolean);
    if (rows.length) parts.push(`Языки: ${rows.join("; ")}`);
  }

  const contactItems = Array.isArray(resume.contact) ? resume.contact : [];
  if (contactItems.length) {
    parts.push("Контакты:");
    for (const c of contactItems.slice(0, 30)) {
      if (!c || typeof c !== "object") continue;
      const typeName = asIdName((c as any).type) || asString((c as any).kind) || "contact";
      const value = asString((c as any).value) || asString((c as any).contact_value);
      const comment = asString((c as any).comment);
      if (!value) continue;
      parts.push(`- ${typeName}: ${value}${comment ? ` (${comment})` : ""}`);
    }
  }

  const sites = Array.isArray(resume.site) ? resume.site : [];
  if (sites.length) {
    const rows = sites
      .map((s: any) => {
        const type = asIdName(s?.type) || "site";
        const url = asString(s?.url);
        return url ? `${type}: ${url}` : "";
      })
      .filter(Boolean);
    if (rows.length) {
      parts.push("Профили:");
      for (const row of rows) parts.push(`- ${row}`);
    }
  }

  const experience = Array.isArray(resume.experience) ? resume.experience : [];
  if (experience.length) {
    parts.push("Опыт:");
    for (const e of experience.slice(0, 25)) {
      if (!e || typeof e !== "object") continue;
      const company = asString((e as any).company) || asString((e as any).employer?.name);
      const position = asString((e as any).position);
      const start = asString((e as any).start);
      const end = asString((e as any).end);
      const period = joinPeriod(start, end);
      const header = [company, position].filter(Boolean).join(" — ");
      if (header) parts.push(`- ${header}${period ? ` (${period})` : ""}`);
      const description = asString((e as any).description);
      if (description) parts.push(`  ${description}`);
    }
  }

  const education = resume.education && typeof resume.education === "object" ? resume.education : null;
  const primaryEdu = Array.isArray(education?.primary) ? education.primary : [];
  if (primaryEdu.length) {
    parts.push("Образование:");
    for (const ed of primaryEdu.slice(0, 15)) {
      if (!ed || typeof ed !== "object") continue;
      const nameEd = asString((ed as any).name);
      const org = asString((ed as any).organization);
      const result = asString((ed as any).result);
      const year = typeof (ed as any).year === "number" ? String((ed as any).year) : "";
      const line = [nameEd, org, result].filter(Boolean).join(" — ");
      if (line) parts.push(`- ${line}${year ? ` (${year})` : ""}`);
    }
  }

  const summary = asString(resume.summary);
  if (summary) parts.push(`О себе: ${summary}`);

  if (includeRawJson) {
    const clean = sanitizeForJson(resume);
    if (clean) {
      parts.push("Полные данные HH.ru (JSON):");
      parts.push(JSON.stringify(clean, null, 2));
    }
  }

  return parts.join("\n").trim();
}

export function hhResumeName(resume: any): string {
  if (!resume || typeof resume !== "object") return "Кандидат";
  const first = typeof resume.first_name === "string" ? resume.first_name.trim() : "";
  const last = typeof resume.last_name === "string" ? resume.last_name.trim() : "";
  const middle = typeof resume.middle_name === "string" ? resume.middle_name.trim() : "";
  const name = [last, first, middle].filter(Boolean).join(" ").trim();
  return name || "Кандидат";
}

export function hhResumePosition(resume: any): string {
  if (!resume || typeof resume !== "object") return "—";
  const title = typeof resume.title === "string" ? resume.title.trim() : "";
  return title || "—";
}
