"use client";

import { usePathname } from "next/navigation";
import FloatingChatBot from "@/components/common/FloatingChatBot";

export default function MiniChatWrapperConditional() {
  const pathname = usePathname();
  
  // Не показываем мини-чат на странице чата
  if (pathname?.includes("/dashboard/chat")) {
    return null;
  }
  
  return <FloatingChatBot />;
}

