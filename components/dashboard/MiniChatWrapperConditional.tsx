"use client";

import { usePathname } from "next/navigation";
import FloatingChatBot from "@/components/common/FloatingChatBot";
import { useMembershipAccess } from "@/hooks/useMembershipAccess";

export default function MiniChatWrapperConditional() {
  const pathname = usePathname();
  const { isApproved } = useMembershipAccess();

  // Не показываем мини-чат на странице чата
  if (pathname?.includes("/dashboard/chat")) {
    return null;
  }

  // Виджет ИИ только у активных членов профсоюза (одобренных)
  if (!isApproved) {
    return null;
  }

  return <FloatingChatBot />;
}

