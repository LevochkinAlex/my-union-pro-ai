"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

const REFRESH_EVENT = "partner-applications-new-refresh";

export function dispatchPartnerApplicationsNewRefresh() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(REFRESH_EVENT));
  }
}

/** Красный счётчик заявок в статусе «Новая» (как у чата / уведомлений). */
export default function PartnerApplicationsNewBadge() {
  const { data: session } = useSession();
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(async () => {
    if (!session?.user?.id) return;
    try {
      const res = await fetch("/api/partner/applications/new-count");
      if (!res.ok) {
        setCount(0);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { count?: unknown };
      const n = typeof data.count === "number" ? data.count : Number(data.count);
      setCount(Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
    } catch {
      setCount(0);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    const onRefresh = () => fetchCount();
    window.addEventListener(REFRESH_EVENT, onRefresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener(REFRESH_EVENT, onRefresh);
    };
  }, [session?.user?.id, fetchCount]);

  if (count <= 0) return null;

  return (
    <span
      className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white"
      aria-label={`Новых заявок: ${count}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
