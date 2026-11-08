import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const pdfPagePath = "app/(marketing)/pdf-tools/page.tsx";
const landingPagePath = "app/(marketing)/page.tsx";
const promoPath = "components/landing/pdf-tools-promo.tsx";
const dashboardNavItemsPath = "components/dashboard/nav-items.ts";

function readRequiredSource(path: string): string {
  assert.equal(existsSync(path), true, `${path} must exist`);
  return readFileSync(path, "utf8");
}

test("public PDF tools page exists with SEO metadata, HR copy, privacy copy, and external editor CTA", () => {
  const source = readRequiredSource(pdfPagePath);

  assert.match(source, /export const metadata:\s*Metadata/);
  assert.match(source, /PDF-инструменты для HR/);
  assert.match(source, /getCanonicalUrl\(["']\/pdf-tools["']\)/);
  assert.match(source, /https:\/\/pdf\.hiiire\.com/);
  assert.match(source, /резюме|оффер|анкеты|кадровые документы/i);
  assert.match(source, /Конвертировать форматы|Преобразуйте изображения/i);
  assert.match(source, /не сохраняет|не загружаются|не хранятся/i);
  assert.match(source, /target=["']_blank["']/);
  assert.match(source, /rel=["']noopener noreferrer["']/);
  assert.doesNotMatch(source, /<iframe/i);
  assert.doesNotMatch(source, /\/api\/pdf|proxy|reverse proxy/i);
});

test("main landing renders PDF tools promo after pricing", () => {
  const landingSource = readRequiredSource(landingPagePath);
  const promoSource = readRequiredSource(promoPath);

  assert.match(landingSource, /import \{ PdfToolsPromo \} from ["']@\/components\/landing\/pdf-tools-promo["']/);
  assert.match(landingSource, /<Pricing\s*\/>\s*<PdfToolsPromo\s*\/>/);
  assert.match(promoSource, /PDF/);
  assert.match(promoSource, /https:\/\/pdf\.hiiire\.com/);
  assert.match(promoSource, /href=["']\/pdf-tools["']/);
  assert.match(promoSource, /target=["']_blank["']/);
  assert.match(promoSource, /rel=["']noopener noreferrer["']/);
  assert.doesNotMatch(promoSource, /<iframe/i);
  assert.doesNotMatch(promoSource, /whileInView|initial=\{\{\s*opacity:\s*0/);
});

test("dashboard navigation exposes external PDF tools link", () => {
  const source = readRequiredSource(dashboardNavItemsPath);

  assert.match(source, /FileText|Files/, "dashboard nav must use a lucide document icon");
  assert.match(source, /title:\s*"PDF-инструменты"/, "dashboard nav must label the PDF tools item");
  assert.match(source, /href:\s*"https:\/\/pdf\.hiiire\.com"/, "dashboard nav must link to the PDF tools subdomain");
  assert.match(source, /external:\s*true/, "dashboard nav must mark PDF tools as external");
});
