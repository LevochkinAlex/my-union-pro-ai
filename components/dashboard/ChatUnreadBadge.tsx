"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";

export default function ChatUnreadBadge() {
  const { data: session } = useSession();
  const [unreadCount, setUnreadCount] = useState(0);
  const pathname = usePathname();

  const fetchUnreadCount = useCallback(async () => {
    if (!session?.user?.id) return;
    
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
      Object.values(rooms).forEach((room: unknown) => {
        const r = room as { unread_notifications?: { notification_count?: number } };
        const unread = r.unread_notifications?.notification_count || 0;
        total += unread;
      });
      
      setUnreadCount(total);
    } catch (err) {
      console.error('Failed to fetch unread count:', err);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;

    fetchUnreadCount();
    
    // Refresh every 10 seconds
    const interval = setInterval(fetchUnreadCount, 10000);
    return () => clearInterval(interval);
  }, [session, fetchUnreadCount]);

  // Refresh when navigating away from chat (user might have read messages)
  useEffect(() => {
    if (!pathname?.includes('/chat')) {
      // Small delay to allow read receipts to sync
      const timeout = setTimeout(fetchUnreadCount, 1000);
      return () => clearTimeout(timeout);
    }
  }, [pathname, fetchUnreadCount]);

  // Listen for custom event from chat to refresh badge
  useEffect(() => {
    const handleRefresh = () => fetchUnreadCount();
    window.addEventListener('chat-messages-read', handleRefresh);
    return () => window.removeEventListener('chat-messages-read', handleRefresh);
  }, [fetchUnreadCount]);

  if (unreadCount === 0) return null;

  return (
    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 text-[10px] font-medium bg-red-500 text-white rounded-full flex items-center justify-center">
      {unreadCount > 99 ? '99+' : unreadCount}
    </span>
  );
}
