"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

export default function NotificationUnreadBadge() {
  const { data: session } = useSession();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!session?.user?.id) return;

    async function fetchUnreadCount() {
      try {
        const response = await fetch('/api/notifications?unreadOnly=true&limit=1');
        if (!response.ok) return;
        
        const data = await response.json();
        setUnreadCount(data.unreadCount || 0);
      } catch (err) {
        console.error('Failed to fetch notification count:', err);
      }
    }

    fetchUnreadCount();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [session]);

  if (unreadCount === 0) return null;

  return (
    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 text-[10px] font-medium bg-red-500 text-white rounded-full flex items-center justify-center">
      {unreadCount > 99 ? '99+' : unreadCount}
    </span>
  );
}
