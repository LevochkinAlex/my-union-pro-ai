"use client";

import MiniChat from "@/components/common/MiniChat";
import { usePathname, useSearchParams } from "next/navigation";

export default function MiniChatWrapper() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  // Исключаем страницы чатов и обращений
  const hasSession = searchParams?.has("session");
  const hasAppeal = searchParams?.has("appeal");
  const hasMode = searchParams?.has("mode");
  
  // Если это страница /dashboard с параметрами сессии/обращения или страница чата
  const isChatPage = pathname?.startsWith("/dashboard") && (
    hasSession ||
    hasAppeal ||
    hasMode ||
    pathname.includes("/ai-chat")
  );

  if (isChatPage) {
    return null;
  }

  return <MiniChat />;
}

