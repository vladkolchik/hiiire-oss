import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function normalizeDisplayText(input: string | null | undefined): string {
  return String(input ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function formatMinutesAndSeconds(seconds: number): string {
  const safeSeconds = Math.max(0, Math.ceil(seconds))
  const minutes = Math.floor(safeSeconds / 60)
  const remainingSeconds = safeSeconds % 60

  return `${minutes} мин ${remainingSeconds} с`
}
