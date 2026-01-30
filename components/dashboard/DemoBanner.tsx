"use client";

import { signOut } from "next-auth/react";

const DEMO_STORAGE_KEYS = [
  "demo_assistant_messages",
  "demo_posts",
  "demo_profile",
  "demo_appeals",
  "demo_documents",
];

export default function DemoBanner() {
  const handleReset = () => {
    try {
      DEMO_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    } catch {
      // ignore
    }
    signOut({ callbackUrl: "/login" });
  };

  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-900/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
          Демо-режим: данные не сохраняются в систему. После выхода или очистки кэша всё обнулится.
        </p>
        <button
          type="button"
          onClick={handleReset}
          className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200 dark:hover:bg-amber-900/50"
        >
          Выйти из демо
        </button>
      </div>
    </div>
  );
}
