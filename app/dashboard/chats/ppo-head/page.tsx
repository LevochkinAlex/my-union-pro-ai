"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { DEMO_USER_ID, DEMO_MEMBER_USER_ID } from "@/lib/demo-constants";

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

function PPOHeadChatsContent() {
  const { data: session } = useSession();
  const router = useRouter();

  // Демо-член не должен видеть раздел председателя — редирект на «Чат»
  const isDemoMember = session?.user?.id === DEMO_MEMBER_USER_ID;
  const isDemoChairman = session?.user?.id === DEMO_USER_ID;
  const isPPOHead =
    isDemoChairman ||
    (session?.user?.viewMode === "PPO_HEAD" ||
      session?.user?.viewMode === "MPO_HEAD" ||
      session?.user?.viewMode === "RPO_HEAD" ||
      ((session?.user as { role?: string; isPPOHead?: boolean })?.role === "PPO_HEAD" && (session?.user as { isPPOHead?: boolean })?.isPPOHead === true));

  useEffect(() => {
    if (session && (isDemoMember || !isPPOHead)) {
      router.replace("/dashboard/chat");
    }
  }, [session, isDemoMember, isPPOHead, router]);

  if (!session) {
    return <ChatSkeleton />;
  }

  return (
    <div className="fixed inset-0 top-16 md:top-0 md:left-64 right-0 bottom-0">
      <Suspense fallback={<ChatSkeleton />}>
        <SlackStyleChat
          isChairman={true}
          baseUrl="/dashboard/chats/ppo-head"
          containerHeight="100%"
        />
      </Suspense>
    </div>
  );
}

export default function PPOHeadChatsPage() {
  return (
    <Suspense fallback={<ChatSkeleton />}>
      <PPOHeadChatsContent />
    </Suspense>
  );
}
