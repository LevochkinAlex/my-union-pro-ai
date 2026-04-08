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
          <div className="flex flex-col gap-1.5 text-center sm:text-left">
            <p className="text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} {COMPANY.name}. {COMPANY.product}. Все права защищены.
            </p>
            <p className="text-xs text-muted-foreground">
              Разработано{" "}
              <a
                href="https://yappix.ru"
                className="text-primary hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                YappiX
                <span className="sr-only"> yappix.ru</span>
              </a>
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
            <a
              href={COMPANY.vkGroupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-[#0077FF]/40 hover:bg-[#0077FF]/10 hover:text-foreground"
              aria-label="Сообщество MyUnion Pro ВКонтакте"
            >
              <svg
                className="h-4 w-4 shrink-0 text-[#0077FF]"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden
              >
                <path d="M15.684 0H8.316C1.592 0 0 1.592 0 8.316v7.368C0 22.408 1.592 24 8.316 24h7.368C22.408 24 24 22.408 24 15.684V8.316C24 1.592 22.381 0 15.684 0zm3.692 17.123h-1.744c-.66 0-.864-.523-2.049-1.714-1.033-1.034-1.49-1.184-1.747-1.184-.198 0-.577.05-.577.577v1.074c0 .432-.153.648-1.385.648-1.95 0-4.118-1.309-5.645-3.738-2.307-3.538-2.944-6.214-2.944-6.75 0-.25.198-.385.648-.385h1.744c.483 0 .625.198.802.676.882 2.49 2.354 4.674 2.964 4.674.226 0 .33-.102.33-.66v-2.593c-.067-1.184-.698-1.284-.698-1.694 0-.2.165-.4.432-.4h2.744c.366 0 .498.198.498.634v4.007c0 .366.165.494.267.494.226 0 .413-.136.826-.542 1.272-1.43 2.18-3.628 2.18-3.628.15-.327.395-.634.932-.634h1.744c.588 0 .712.31.588.726-.15.542-1.592 1.956-1.592 1.956-.134.183-.185.268 0 .483.134.176.567.534.861.864.534.593 1.043 1.365 1.043 1.813 0 .434-.225.655-.761.655z" />
              </svg>
              <span className="font-medium text-foreground/90">ВКонтакте</span>
            </a>
            <a
              href={COMPANY.telegramChannelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-[#229ED9]/40 hover:bg-[#229ED9]/10 hover:text-foreground"
              aria-label="Канал MyUnion Pro в Telegram @myunionpro"
            >
              <svg
                className="h-4 w-4 shrink-0 text-[#229ED9]"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden
              >
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
              </svg>
              <span className="font-medium text-foreground/90">Telegram</span>
              <span className="sr-only">@myunionpro</span>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
