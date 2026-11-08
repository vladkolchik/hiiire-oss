export type CsvColumn<T> = { key: keyof T; header: string; map?: (row: T) => unknown };

export function toCSV<T extends Record<string, unknown>>(rows: T[], columns: CsvColumn<T>[]): string {
  const esc = (val: unknown) => {
    if (val === null || val === undefined) return "";
    const s = typeof val === "string"
      ? val
      : val instanceof Date
      ? val.toISOString()
      : typeof val === "number" || typeof val === "boolean"
      ? String(val)
      : typeof val === "object"
      ? JSON.stringify(val)
      : String(val);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };

  const header = columns.map((c) => esc(c.header)).join(",");
  const body = rows
    .map((row) => columns.map((c) => esc(c.map ? c.map(row) : (row[c.key] as unknown))).join(","))
    .join("\n");

  return header + (body ? "\n" + body : "");
}

export function downloadCSV(filename: string, csv: string) {
  if (typeof window === "undefined") return;
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


