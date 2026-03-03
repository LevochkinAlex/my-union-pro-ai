"use client";

import { Suspense, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { MembershipGate } from "@/components/MembershipGate";
import { safeJsonParse } from "@/lib/api-client";
import { DEMO_MEMBER_USER_ID } from "@/lib/demo-constants";

// Lazy load SlackStyleChat компонент
const SlackStyleChat = dynamic(() => import("@/components/chat/SlackStyleChat"), {
  ssr: false,
  loading: () => <ChatSkeleton />,
});

function ChatSkeleton() {
  return (
    <div className="flex h-full bg-gradient-to-br from-blue-50 to-white dark:from-gray-900 dark:to-gray-800 items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 relative">
          <div className="absolute inset-0 rounded-full border-4 border-blue-200 dark:border-blue-800"></div>
          <div className="absolute inset-0 rounded-full border-4 border-t-blue-600 animate-spin"></div>
        </div>
        <p className="text-gray-600 dark:text-gray-400">Загрузка чата...</p>
      </div>
    </div>
  );
}

function ChatContent() {
  const { data: session } = useSession();
  const [isChairman, setIsChairman] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkChairmanStatus() {
      if (!session?.user?.id) {
        setLoading(false);
        return;
      }

      // Страница /dashboard/chat — только для членов: у члена всегда «Чат», без функций председателя
      if (session.user.id === DEMO_MEMBER_USER_ID) {
        setIsChairman(false);
        setLoading(false);
        return;
      }

      try {
        // Запрашиваем viewMode из API для точной проверки
        const response = await fetch("/api/user/view-mode");
        if (response.ok) {
          const data = await safeJsonParse(response);
          if (data) {
            const viewMode = data.currentMode ?? data.viewMode;
            setIsChairman(
              viewMode === "PPO_HEAD" ||
              viewMode === "MPO_HEAD" ||
              viewMode === "RPO_HEAD"
            );
          }
        } else {
          const user = session.user as any;
          const viewMode = user.viewMode;
          if (viewMode === "MEMBER") {
            setIsChairman(false);
          } else if (user.isPPOHead || user.isMPOHead || user.isRPOHead) {
            setIsChairman(true);
          } else {
            setIsChairman(false);
          }
        }
      } catch (error) {
        console.error("[chat/page] Error checking chairman status:", error);
        setIsChairman(false);
      } finally {
        setLoading(false);
      }
    }

    checkChairmanStatus();
  }, [session]);

  if (loading) {
    return <ChatSkeleton />;
  }

  return (
    <div className="fixed inset-0 top-16 md:top-0 md:left-64 right-0 bottom-0">
      <Suspense fallback={<ChatSkeleton />}>
        <SlackStyleChat
          isChairman={isChairman}
          baseUrl="/dashboard/chat"
          containerHeight="100%"
        />
      </Suspense>
    </div>
  );
}

export default function ChatPage() {
  return (
    <MembershipGate
      showBlur={true}
      title="Чаты для членов профсоюза"
      description="Общайтесь с коллегами и председателем. Станьте членом профсоюза для доступа к чатам."
      allowExcludedForChat={true}
    >
      <ChatContent />
    </MembershipGate>
  );
}
