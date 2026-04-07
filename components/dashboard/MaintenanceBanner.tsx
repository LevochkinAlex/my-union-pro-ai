"use client";

import { useEffect, useMemo, useState } from "react";

interface MaintenanceBannerProps {
  userId?: string;
}

export default function MaintenanceBanner({ userId }: MaintenanceBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const storageKey = useMemo(
    () => `maintenance-banner-dismissed:${userId || "anonymous"}`,
    [userId]
  );

  useEffect(() => {
    try {
      const isDismissed = window.localStorage.getItem(storageKey) === "1";
      if (isDismissed) {
        setDismissed(true);
      }
    } catch {
      // ignore localStorage errors
    }
  }, [storageKey]);

  if (dismissed) {
    return null;
  }

  return (
    <div className="sticky top-0 z-50 flex flex-col gap-3 bg-yellow-500 px-4 py-3 text-white shadow-lg sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-2 sm:items-center">
        <svg
          className="mt-0.5 h-5 w-5 flex-shrink-0 sm:mt-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <span className="min-w-0 font-medium text-sm sm:text-base">
          На платформе ведутся работы по модернизации. Просим отнестись с пониманием. Некоторые разделы (скидки, отчёты) могут работать с перебоями.
        </span>
      </div>
      <button
        type="button"
        onClick={() => {
          setDismissed(true);
          try {
            window.localStorage.setItem(storageKey, "1");
          } catch {
            // ignore localStorage errors
          }
        }}
        className="ml-auto shrink-0 self-end rounded-lg p-1.5 transition-colors hover:bg-yellow-600 sm:ml-0 sm:self-start"
        title="Скрыть баннер"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
