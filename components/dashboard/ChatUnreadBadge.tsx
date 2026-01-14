"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";

export default function ChatUnreadBadge() {
  const { data: session } = useSession();
  const [unreadCount, setUnreadCount] = useState(0);
  const pathname = usePathname();
  const syncTokenRef = useRef<string | null>(null);

  const fetchUnreadCount = useCallback(async (resetToZero = false) => {
    if (!session?.user?.id) return;
    
    // If requested to reset, set to 0 immediately
    if (resetToZero) {
      setUnreadCount(0);
      return;
    }
    
    try {
      // Get Matrix credentials
      const authResp = await fetch('/api/chat/matrix/auth', { method: 'POST' });
      if (!authResp.ok) return;
      
      const { accessToken, serverUrl } = await authResp.json();
      
      // Build sync URL - use since token for incremental sync if available
      let syncUrl = `${serverUrl}/_matrix/client/v3/sync?timeout=0&filter={"room":{"timeline":{"limit":1}}}`;
      if (syncTokenRef.current) {
        syncUrl += `&since=${encodeURIComponent(syncTokenRef.current)}`;
      }
      
      const syncResp = await fetch(syncUrl, { 
        headers: { 'Authorization': `Bearer ${accessToken}` } 
      });
      
      if (!syncResp.ok) return;
      
      const data = await syncResp.json();
      
      // Save next_batch token for incremental syncs
      if (data.next_batch) {
        syncTokenRef.current = data.next_batch;
      }
      
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
    
    // Refresh every 30 seconds (less frequent since we use incremental sync)
    const interval = setInterval(() => fetchUnreadCount(), 30000);
    return () => clearInterval(interval);
  }, [session, fetchUnreadCount]);

  // Reset badge when user is on chat page (they're reading messages)
  useEffect(() => {
    if (pathname?.includes('/chat')) {
      // User is viewing chats - reset badge after a short delay
      const timeout = setTimeout(() => setUnreadCount(0), 2000);
      return () => clearTimeout(timeout);
    }
  }, [pathname]);

  // Listen for custom event from chat to refresh badge
  useEffect(() => {
    const handleRefresh = (e: Event) => {
      const customEvent = e as CustomEvent;
      // If event has detail with count, use it; otherwise reset to 0
      if (customEvent.detail?.count !== undefined) {
        setUnreadCount(customEvent.detail.count);
      } else {
        // Reset to 0 immediately, then fetch fresh data after delay
        setUnreadCount(0);
        setTimeout(() => fetchUnreadCount(), 3000);
      }
    };
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
