"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
}

function ChatLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <div className="inline-flex h-12 w-12 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600"></div>
        <p className="mt-4 text-gray-600 dark:text-gray-400">Загрузка чатов...</p>
      </div>
    </div>
  );
}

export default function ChatRedirect({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function getLatestSession() {
      try {
        const response = await fetch("/api/chat/sessions");
        if (response.ok) {
          const data = await response.json();
          const sessions = data.sessions as ChatSession[];
          
          // Sort sessions by date and get the most recent one
          if (sessions && sessions.length > 0) {
            const latestSession = sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
            // Redirect to the latest session
            router.replace(`/dashboard?session=${latestSession.id}`);
          } else {
            // No sessions, stay on the current page to show the welcome message
            setIsLoading(false);
          }
        } else {
          // Error fetching, just show the welcome page
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Failed to fetch latest session:", error);
        setIsLoading(false);
      }
    }

    getLatestSession();
  }, [router]);

  if (isLoading) {
    return <ChatLoading />;
  }

  return <>{children}</>;
}
