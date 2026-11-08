import Link from "next/link";
import { LandingSectionLink } from "@/components/landing/landing-section-link";
import { Separator } from "@/components/ui/separator";
import { landingFooterResourceLinks, landingNavigationLinks } from "@/lib/landing-navigation-links";

export function Footer() {
  const currentYear = new Date().getFullYear();
  const productLinks = landingNavigationLinks.filter((item) => item.href !== "/blog");

  return (
    <footer className="border-t bg-muted/50">
      <div className="container mx-auto px-4 py-8 sm:px-6 sm:py-12 md:py-16 lg:px-8">
        <div className="grid gap-6 sm:gap-8 sm:grid-cols-2 lg:grid-cols-5">
          <div className="sm:col-span-2 lg:col-span-2">
            <Link href="/" className="flex items-center space-x-2 mb-3 sm:mb-4">
              <span className="text-xl font-bold sm:text-2xl">hiiire</span>
            </Link>
            <p className="text-xs text-muted-foreground sm:text-sm max-w-xs leading-relaxed">
              Автоматизируйте подбор персонала с помощью AI. Интеграция с HH.ru,
              анализ резюме, умный календарь собеседований.
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-3 text-sm sm:text-base sm:mb-4">Продукт</h3>
            <ul className="space-y-2 text-xs text-muted-foreground sm:space-y-3 sm:text-sm">
              {productLinks.map((item) => (
                <li key={item.href}>
                  <LandingSectionLink href={item.href} className="hover:text-foreground transition-colors inline-block py-1">
                    {item.label}
                  </LandingSectionLink>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-3 text-sm sm:text-base sm:mb-4">Материалы</h3>
            <ul className="space-y-2 text-xs text-muted-foreground sm:space-y-3 sm:text-sm">
              {landingFooterResourceLinks.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="hover:text-foreground transition-colors inline-block py-1">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-3 text-sm sm:text-base sm:mb-4">Компания</h3>
            <ul className="space-y-2 text-xs text-muted-foreground sm:space-y-3 sm:text-sm">
              <li>
                <Link href="/about" className="hover:text-foreground transition-colors inline-block py-1">
                  О нас
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-foreground transition-colors inline-block py-1">
                  Контакты
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-foreground transition-colors inline-block py-1">
                  Политика конфиденциальности
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-foreground transition-colors inline-block py-1">
                  Публичная оферта
                </Link>
              </li>
              <li>
                <Link href="/refund" className="hover:text-foreground transition-colors inline-block py-1">
                  Возврат и отказ от услуг
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <Separator className="my-6 sm:my-8" />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 text-xs text-muted-foreground sm:text-sm">
          <p>© {currentYear} hiiire. Все права защищены.</p>
          <div className="flex gap-4 sm:gap-6">
            <a href="https://t.me/vladkolchik" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors inline-block py-1">
              Telegram
            </a>
            <a href="mailto:inbox@hiiire.com" className="hover:text-foreground transition-colors inline-block py-1">
              Email
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

