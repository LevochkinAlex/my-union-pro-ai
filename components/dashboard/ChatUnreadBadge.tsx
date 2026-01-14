"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

export default function ChatUnreadBadge() {
  const { data: session } = useSession();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!session?.user?.id) return;

    async function fetchUnreadCount() {
      try {
        // Get Matrix credentials
        const authResp = await fetch('/api/chat/matrix/auth', { method: 'POST' });
        if (!authResp.ok) return;
        
        const { accessToken, serverUrl } = await authResp.json();
        
        // Get sync data with limited filter
        const syncResp = await fetch(
          `${serverUrl}/_matrix/client/v3/sync?timeout=0&filter={"room":{"timeline":{"limit":1}}}`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        
        if (!syncResp.ok) return;
        
        const data = await syncResp.json();
        const rooms = data.rooms?.join || {};
        
        let total = 0;
        Object.values(rooms).forEach((room: any) => {
          const unread = room.unread_notifications?.notification_count || 0;
          total += unread;
        });
        
        setUnreadCount(total);
      } catch (err) {
        console.error('Failed to fetch unread count:', err);
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
