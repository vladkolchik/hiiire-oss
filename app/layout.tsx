import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PostHogProvider } from "@/components/analytics/posthog-provider";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { serializeJsonLd } from "@/lib/content/json-ld";
import {
  buildOrganizationJsonLd,
  buildSoftwareApplicationJsonLd,
} from "@/lib/content/structured-data";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "hiiire - Умный подбор персонала с AI",
  description: "Автоматизируйте подбор персонала с помощью AI. Интеграция с HH.ru, анализ резюме, умный календарь собеседований.",
  keywords: ["HR", "подбор персонала", "AI", "HH.ru", "рекрутинг", "собеседования"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const globalJsonLd = [
    buildOrganizationJsonLd(),
    buildSoftwareApplicationJsonLd(),
  ];

  return (
    <html lang="ru" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(globalJsonLd) }}
        />
        <PostHogProvider>
          <ThemeProvider>
            {children}
            <Toaster />
          </ThemeProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
