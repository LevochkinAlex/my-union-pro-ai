"use client";

import { useEffect, useCallback, useState, useRef } from "react";
import { syncManager } from "@/lib/sync-manager";

interface UseAutoSyncDiscountsOptions {
  /** Автоматическая синхронизация при монтировании */
  autoSyncOnMount?: boolean;
  /** Алиас для autoSyncOnMount (обратная совместимость) */
  syncOnMount?: boolean;
  /** Синхронизация при возвращении на вкладку */
  syncOnFocus?: boolean;
  /** Callback после успешной синхронизации */
  onSyncComplete?: (result: SyncResult) => void;
  /** Callback при ошибке синхронизации */
  onSyncError?: (error: string) => void;
}

interface SyncResult {
  success: boolean;
  message: string;
  synced?: number;
  updated?: number;
  expired?: number;
  usedFallback?: boolean;
}

export function useAutoSyncDiscounts(options: UseAutoSyncDiscountsOptions = {}) {
  const {
    autoSyncOnMount = true,
    syncOnMount, // Алиас для обратной совместимости
    syncOnFocus = true,
    onSyncComplete,
    onSyncError,
  } = options;
  
  // syncOnMount имеет приоритет если указан явно
  const shouldAutoSync = syncOnMount ?? autoSyncOnMount;

  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const mountedRef = useRef(false);
  const syncInProgressRef = useRef(false);

  const performSync = useCallback(async (force: boolean = false): Promise<SyncResult> => {
    // Предотвращаем параллельные вызовы
    if (syncInProgressRef.current) {
      return { success: false, message: "Синхронизация уже выполняется" };
    }

    syncInProgressRef.current = true;
    setIsSyncing(true);

    try {
      const result = await syncManager.sync(force);
      
      setLastSyncResult(result);
      
      if (result.success && !result.cached) {
        setLastSyncTime(new Date());
        onSyncComplete?.(result);
        
        // Логируем результат
        if (result.synced || result.updated) {
          console.log(`[useAutoSyncDiscounts] ✅ Synced: ${result.synced || 0} new, ${result.updated || 0} updated`);
        }
      } else if (!result.success) {
        onSyncError?.(result.message);
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Неизвестная ошибка";
      const result: SyncResult = { success: false, message: errorMessage };
      
      setLastSyncResult(result);
      onSyncError?.(errorMessage);
      
      return result;
    } finally {
      setIsSyncing(false);
      syncInProgressRef.current = false;
    }
  }, [onSyncComplete, onSyncError]);

  // Принудительная синхронизация
  const forceSync = useCallback(() => {
    syncManager.reset();
    return performSync(true);
  }, [performSync]);

  // Автосинхронизация при монтировании
  useEffect(() => {
    if (!shouldAutoSync) return;
    
    // Откладываем на следующий тик для предотвращения race conditions
    const timeoutId = setTimeout(() => {
      if (!mountedRef.current) {
        mountedRef.current = true;
        performSync(false);
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [shouldAutoSync, performSync]);

  // Синхронизация при возвращении на вкладку
  useEffect(() => {
    if (!syncOnFocus) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && syncManager.canSync) {
        console.log("[useAutoSyncDiscounts] Tab focused, checking sync...");
        performSync(false);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [syncOnFocus, performSync]);

  return {
    /** Выполнить синхронизацию */
    sync: performSync,
    /** Принудительная синхронизация (сбрасывает кулдаун) */
    forceSync,
    /** Идёт ли синхронизация */
    isSyncing,
    /** Результат последней синхронизации */
    lastSyncResult,
    /** Время последней успешной синхронизации */
    lastSyncTime,
    /** Время до следующей доступной синхронизации (в секундах) */
    timeUntilNextSync: syncManager.getTimeUntilNextSync(),
    /** Можно ли синхронизировать сейчас */
    canSync: syncManager.canSync,
  };
}
