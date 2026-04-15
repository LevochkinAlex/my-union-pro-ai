"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

interface SubscriptionLockGuardProps {
  locked: boolean;
}

/**
 * Если доступ организации выключен админом, принудительно оставляем
 * пользователя только в разделе подписки/оплаты.
 */
export default function SubscriptionLockGuard({ locked }: SubscriptionLockGuardProps) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!locked) return;
    if (!pathname?.startsWith("/dashboard")) return;
    if (pathname === "/dashboard/subscription") return;
    router.replace("/dashboard/subscription");
  }, [locked, pathname, router]);

  return null;
}
