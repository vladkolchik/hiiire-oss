import { AuthProvider } from "@/hooks/use-auth";
import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <div className="relative min-h-screen">
        <div className="absolute top-4 left-4">
          <Link href="/" className="flex items-center space-x-2">
            <span className="text-2xl font-bold">hiiire</span>
          </Link>
        </div>
        {children}
      </div>
    </AuthProvider>
  );
}

