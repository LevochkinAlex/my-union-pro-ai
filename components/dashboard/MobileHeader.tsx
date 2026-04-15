"use client";

import Link from "next/link";
import { LogoIcon } from "@/components/Logo";

interface MobileHeaderProps {
  onMenuClick: () => void;
  brandHref?: string;
}

export default function MobileHeader({ onMenuClick, brandHref }: MobileHeaderProps) {
  return (
    <header className="md:hidden fixed top-0 left-0 right-0 z-30 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between px-4 h-16">
        {/* Menu button */}
        <button
          onClick={onMenuClick}
          className="p-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="Открыть меню"
        >
          <svg
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>

        {/* Logo */}
        <Link
          href={brandHref || "/dashboard"}
          className="flex items-center gap-2 flex-1 justify-center"
        >
          <LogoIcon className="h-8 w-8" size="sm" />
          <span className="text-xl font-bold text-gray-900 dark:text-white">
            MyUnion
          </span>
        </Link>

        {/* Spacer for balance */}
        <div className="w-10"></div>
      </div>
    </header>
  );
}

