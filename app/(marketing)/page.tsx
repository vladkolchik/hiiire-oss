import type { Metadata } from "next";

import { Navigation } from "@/components/landing/navigation";
import { Hero } from "@/components/landing/hero";
import { Features } from "@/components/landing/features";
import { HrAssistantPromo } from "@/components/landing/hr-assistant-promo";
import { InternalPortals } from "@/components/landing/internal-portals";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Pricing } from "@/components/landing/pricing";
import { PdfToolsPromo } from "@/components/landing/pdf-tools-promo";
import { Footer } from "@/components/landing/footer";
import { getCanonicalUrl } from "@/lib/content/seo";

const landingTitle = "hiiire - Умный подбор персонала с AI";
const landingDescription =
  "Автоматизируйте подбор персонала с помощью AI. Интеграция с HH.ru, анализ резюме, умный календарь собеседований.";
const landingPreviewImage = "/og/hiiire-preview.png";

export const metadata: Metadata = {
  title: landingTitle,
  description: landingDescription,
  alternates: {
    canonical: getCanonicalUrl("/"),
  },
  openGraph: {
    title: landingTitle,
    description: landingDescription,
    url: getCanonicalUrl("/"),
    siteName: "hiiire",
    type: "website",
    images: [
      {
        url: getCanonicalUrl(landingPreviewImage),
        width: 889,
        height: 344,
        alt: landingTitle,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: landingTitle,
    description: landingDescription,
    images: [getCanonicalUrl(landingPreviewImage)],
  },
};

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navigation />
      <main className="flex-1">
        <Hero />
        <Features />
        <HowItWorks />
        <HrAssistantPromo />
        <InternalPortals />
        <Pricing />
        <PdfToolsPromo />
      </main>
      <Footer />
    </div>
  );
}

