"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";

export default function LandingHeader() {
  const { data: session } = useSession();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2" aria-label="MyUnion Pro — на главную">
          <Logo size="sm" className="shrink-0" />
        </Link>
        <nav className="hidden items-center gap-6 md:flex">
          <a href="#how" className="text-sm font-medium text-foreground/80 hover:text-foreground">
            Как мы работаем
          </a>
          <a href="#roadmap" className="text-sm font-medium text-foreground/80 hover:text-foreground">
            Дорожная карта
          </a>
          <a href="#pricing" className="text-sm font-medium text-foreground/80 hover:text-foreground">
            Цены
          </a>
          <a href="#contacts" className="text-sm font-medium text-foreground/80 hover:text-foreground">
            Контакты
          </a>
        </nav>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          {session?.user ? (
            <Link
              href="/dashboard"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
            >
              Кабинет
            </Link>
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
            >
              Войти
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
