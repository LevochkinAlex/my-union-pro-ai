"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState } from "react";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";

interface NavItem {
  label: string;
  href: string;
}

const MEMBER_ITEMS: NavItem[] = [
  { label: "Возможности", href: "#benefits" },
  { label: "Скриншоты", href: "#screenshots" },
  { label: "Контакты", href: "#contacts" },
];

const ORG_ITEMS: NavItem[] = [
  { label: "Как мы работаем", href: "#how" },
  { label: "Дорожная карта", href: "#roadmap" },
  { label: "Цены", href: "#pricing" },
  { label: "Контакты", href: "#contacts" },
];

export default function MarketingNavbar() {
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  const isOrg = pathname === "/for-organizations";
  const items = isOrg ? ORG_ITEMS : MEMBER_ITEMS;
  const crossLink = isOrg
    ? { href: "/", label: "Для членов" }
    : { href: "/for-organizations", label: "Для организаций" };

  return (
    <header className="sticky top-0 z-50 w-full glass-strong font-marketing border-b border-border/40">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2" aria-label="MyUnion Pro">
          <Logo size="sm" className="shrink-0" />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-8 md:flex">
          {items.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-foreground/70 transition-colors hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
          <Link
            href={crossLink.href}
            className="text-sm font-medium text-primary hover:text-primary/80"
          >
            {crossLink.label}
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          {session?.user ? (
            <Link
              href="/dashboard"
              className="hidden rounded-xl bg-primary/90 px-5 py-2.5 text-sm font-semibold text-primary-foreground backdrop-blur transition-all hover:bg-primary hover:shadow-lg hover:shadow-primary/25 sm:inline-flex"
            >
              Кабинет
            </Link>
          ) : (
            <Link
              href="/login"
              className="hidden rounded-xl bg-primary/90 px-5 py-2.5 text-sm font-semibold text-primary-foreground backdrop-blur transition-all hover:bg-primary hover:shadow-lg hover:shadow-primary/25 sm:inline-flex"
            >
              Войти
            </Link>
          )}

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-foreground/70 hover:text-foreground md:hidden"
            aria-label="Меню"
          >
            {mobileOpen ? (
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <nav className="glass-strong border-t border-white/10 px-4 pb-4 pt-2 md:hidden">
          {items.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm font-medium text-foreground/80 hover:bg-white/5 hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
          <Link
            href={crossLink.href}
            onClick={() => setMobileOpen(false)}
            className="block rounded-lg px-3 py-2.5 text-sm font-medium text-primary hover:bg-primary/5"
          >
            {crossLink.label}
          </Link>
          <Link
            href={session?.user ? "/dashboard" : "/login"}
            onClick={() => setMobileOpen(false)}
            className="mt-2 block rounded-xl bg-primary px-4 py-2.5 text-center text-sm font-semibold text-primary-foreground"
          >
            {session?.user ? "Кабинет" : "Войти"}
          </Link>
        </nav>
      )}
    </header>
  );
}
