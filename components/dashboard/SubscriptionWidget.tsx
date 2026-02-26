"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface SubscriptionData {
  subscription: {
    status: string;
    memberLimit: number | null;
    tariffLabel: string;
    periodEndsAt: string | null;
    trialEndsAt: string | null;
  };
  usage: {
    activeMembers: number;
    availableLicenses: number | null;
    isOverLimit: boolean;
  };
  hasActiveAccess: boolean;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  const end = new Date(iso);
  const now = new Date();
  const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

interface SubscriptionWidgetProps {
  onClick?: () => void;
}

export default function SubscriptionWidget({ onClick }: SubscriptionWidgetProps = {}) {
  const pathname = usePathname();
  const isSubscriptionPage = pathname === "/dashboard/subscription";
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/subscription")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !data) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
        <div className="animate-pulse h-16 bg-gray-100 dark:bg-gray-700 rounded" />
      </div>
    );
  }

  const { subscription, usage, hasActiveAccess } = data;
  const periodEnd = subscription.trialEndsAt ?? subscription.periodEndsAt;
  const days = daysLeft(periodEnd);
  const isExpiringSoon = days != null && days >= 0 && days <= 7;
  const isExpired = days != null && days < 0;

  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Подписка
          </p>
          <p className="text-lg font-semibold text-gray-900 dark:text-white truncate">
            {subscription.tariffLabel}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">
            {subscription.memberLimit != null ? (
              <>
                <span className={usage.isOverLimit ? "text-red-600 dark:text-red-400" : ""}>
                  {usage.activeMembers} / {subscription.memberLimit}
                </span>
                {" участников"}
                {usage.availableLicenses != null && usage.availableLicenses >= 0 && (
                  <span className="text-gray-500 dark:text-gray-400">
                    {" "}(свободно {usage.availableLicenses})
                  </span>
                )}
              </>
            ) : (
              <>Безлимит · {usage.activeMembers} участников</>
            )}
          </p>
          {periodEnd && (
            <p className={`text-xs mt-1 ${isExpired ? "text-red-600 dark:text-red-400" : isExpiringSoon ? "text-amber-600 dark:text-amber-400" : "text-gray-500 dark:text-gray-400"}`}>
            {subscription.status === "TRIAL" ? "Пробный период до " : "Подписка до "}
            {formatDate(periodEnd)}
            {days != null && days >= 0 && days <= 7 && ` (осталось ${days} дн.)`}
            {isExpired && " — истекла"}
          </p>
          )}
        </div>
        <div className="flex-shrink-0 p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
          <svg className="h-6 w-6 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
        </div>
      </div>
      {(!hasActiveAccess || isExpiringSoon || isExpired) && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
          {isExpired ? "Продлите подписку" : isExpiringSoon ? "Скоро истекает — продлите" : "Оформите подписку"}
        </p>
      )}
    </>
  );

  if (isSubscriptionPage && onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="block w-full text-left bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 hover:shadow-md transition-shadow cursor-pointer"
      >
        {content}
      </button>
    );
  }

  if (isSubscriptionPage) {
    return (
      <div className="block bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
        {content}
      </div>
    );
  }

  return (
    <Link
      href="/dashboard/subscription"
      className="block bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 hover:shadow-md transition-shadow"
    >
      {content}
    </Link>
  );
}
