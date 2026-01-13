"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import { MembershipGate } from "@/components/MembershipGate";

// Lazy load Matrix Chat компонент
const MatrixChat = dynamic(() => import("@/components/chat/MatrixChat"), {
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

export default function ChatPage() {
  return (
    <MembershipGate
      showBlur={true}
      title="Чаты для членов профсоюза"
      description="Общайтесь с коллегами и председателем. Станьте членом профсоюза для доступа к чатам."
    >
      <div className="fixed inset-0 top-16 md:top-0 md:left-64 right-0 bottom-0">
        <Suspense fallback={<ChatSkeleton />}>
          <MatrixChat />
      </Suspense>
      </div>
    </MembershipGate>
  );
}
