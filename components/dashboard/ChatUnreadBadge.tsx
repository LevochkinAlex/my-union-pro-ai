"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";

export default function ChatUnreadBadge() {
  const { data: session } = useSession();
  const [unreadCount, setUnreadCount] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const pathname = usePathname();
  const syncTokenRef = useRef<string | null>(null);

  const fetchUnreadCount = useCallback(async (resetToZero = false) => {
    if (!session?.user?.id) return;
    
    // If requested to reset, set to 0 immediately
    if (resetToZero) {
      setUnreadCount(0);
      setIsInitialized(true);
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
      
      console.log('[ChatUnreadBadge] Fetched unread count from Matrix:', total);
      setUnreadCount(total);
      setIsInitialized(true);
    } catch (err) {
      console.error('Failed to fetch unread count:', err);
      setIsInitialized(true); // Mark as initialized even on error to avoid showing wrong count
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;

    // Wait a bit before initial fetch to let MatrixChat sync first
    const initialTimeout = setTimeout(() => {
      fetchUnreadCount();
    }, 1500); // Wait 1.5 seconds for MatrixChat to sync
    
    // Refresh every 10 seconds to catch any missed updates
    const interval = setInterval(() => fetchUnreadCount(), 10000);
    
    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [session, fetchUnreadCount]);

  // Listen for custom events from chat to update badge
  useEffect(() => {
    const handleUnreadUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      // Update badge with new count from MatrixChat sync
      if (customEvent.detail?.count !== undefined) {
        console.log('[ChatUnreadBadge] Updated from chat-unread-updated event:', customEvent.detail.count);
        setUnreadCount(customEvent.detail.count);
        setIsInitialized(true); // Mark as initialized when we get data from MatrixChat
      }
    };
    
    const handleMessagesRead = (e: Event) => {
      const customEvent = e as CustomEvent;
      // When messages are marked as read, update count
      if (customEvent.detail?.count !== undefined) {
        console.log('[ChatUnreadBadge] Updated from chat-messages-read event:', customEvent.detail.count);
        setUnreadCount(customEvent.detail.count);
        setIsInitialized(true);
      } else {
        // If no count provided, fetch fresh data
        setTimeout(() => fetchUnreadCount(), 1000);
      }
    };
    
    window.addEventListener('chat-unread-updated', handleUnreadUpdate);
    window.addEventListener('chat-messages-read', handleMessagesRead);
    
    return () => {
      window.removeEventListener('chat-unread-updated', handleUnreadUpdate);
      window.removeEventListener('chat-messages-read', handleMessagesRead);
    };
  }, [fetchUnreadCount]);

  // Don't show badge until initialized (to avoid showing wrong count on page load)
  if (!isInitialized || unreadCount === 0) return null;

  return (
    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 text-[10px] font-medium bg-red-500 text-white rounded-full flex items-center justify-center">
      {unreadCount > 99 ? '99+' : unreadCount}
    </span>
  );
}
