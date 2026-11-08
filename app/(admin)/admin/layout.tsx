/**
 * IMPORTANT:
 * Do NOT guard auth here, otherwise `/admin/login` gets stuck in a redirect loop.
 *
 * Guarded routes live under `app/(admin)/admin/(protected)/*`.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

