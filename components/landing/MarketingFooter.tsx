import Link from "next/link";
import { COMPANY, CONTACTS } from "@/lib/constants/landing";

export default function MarketingFooter() {
  return (
    <footer className="relative border-t border-white/10 font-marketing">
      <div className="gradient-mesh absolute inset-0 opacity-30" aria-hidden />
      <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:py-16">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div>
            <p className="text-lg font-bold text-foreground">{COMPANY.product}</p>
            <p className="mt-1 text-sm text-muted-foreground">{COMPANY.tagline}</p>
            <p className="mt-4 text-xs text-muted-foreground">{COMPANY.name}</p>
            <p className="text-xs text-muted-foreground">{COMPANY.address}</p>
          </div>

          {/* Product */}
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-foreground/60">
              Продукт
            </p>
            <ul className="space-y-2">
              <li>
                <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Для членов профсоюза
                </Link>
              </li>
              <li>
                <Link href="/for-organizations" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Для организаций
                </Link>
              </li>
              <li>
                <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Войти
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-foreground/60">
              Документы
            </p>
            <ul className="space-y-2">
              <li>
                <Link href="/license" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Публичная оферта
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Политика конфиденциальности
                </Link>
              </li>
              <li>
                <Link href="/requisites" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Реквизиты
                </Link>
              </li>
            </ul>
          </div>

          {/* Contacts */}
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-foreground/60">
              Контакты
            </p>
            <ul className="space-y-2">
              {CONTACTS.slice(0, 2).map((c) => (
                <li key={c.email}>
                  <p className="text-sm font-medium text-foreground">{c.name}</p>
                  <a href={`mailto:${c.email}`} className="text-xs text-primary hover:underline">
                    {c.email}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} {COMPANY.name}. {COMPANY.product}. Все права защищены.
          </p>
          <p className="text-xs text-muted-foreground">{COMPANY.workingHours}</p>
        </div>
      </div>
    </footer>
  );
}
