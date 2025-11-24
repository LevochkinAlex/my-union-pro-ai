"use client";

import Chat from "@/components/chat/Chat";
import { Suspense, useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function ChatLoading() {
  return <div>Загрузка чата...</div>;
}

function ChatRedirectLogic({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    // Если уже есть session/mode в URL, не делаем запрос
    if (searchParams.has("session") || searchParams.has("mode") || hasLoadedRef.current) {
      setIsLoading(false);
      return;
    }
    
    hasLoadedRef.current = true;

    async function getLatestSession() {
      try {
        const response = await fetch("/api/chat/sessions");
        if (response.ok) {
          const data = await response.json();
          const sessions = data.sessions as any[];
          
          if (sessions && sessions.length > 0) {
            const latestSession = sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
            router.replace(`/dashboard?session=${latestSession.id}`);
          } else {
            setIsLoading(false);
          }
        } else {
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Failed to fetch latest session:", error);
        setIsLoading(false);
      }
    }

    getLatestSession();
  }, [router, searchParams]);

  if (isLoading) {
    return <ChatLoading />;
  }

  return <>{children}</>;
}


export default function DashboardPage() {
  const searchParams = useSearchParams();
  const hasSession = searchParams.has("session");
  const hasMode = searchParams.has("mode");

  if (hasSession || hasMode) {
    return <Chat />;
  }

  return (
    <ChatRedirectLogic>
      <Chat />
    </ChatRedirectLogic>
  );
}
