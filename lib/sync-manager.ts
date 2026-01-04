/**
 * Менеджер синхронизации с BestBenefits
 * Предотвращает частые запросы к API через кэширование
 */

// УМЕНЬШЕН cooldown: 2 минуты вместо 5
const SYNC_COOLDOWN_MS = 2 * 60 * 1000;
const STORAGE_KEY = "bb_last_sync";

class SyncManager {
  private isSyncing = false;
  private lastSyncTime: number | null = null;

  constructor() {
    // Загружаем время последней синхронизации из localStorage
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.lastSyncTime = parseInt(stored, 10);
      }
    }
  }

  /**
   * Проверяет, нужна ли синхронизация
   */
  private shouldSync(force: boolean = false): boolean {
    if (force) return true;
    if (this.isSyncing) return false;

    const now = Date.now();
    if (this.lastSyncTime === null) return true;

    const timeSinceLastSync = now - this.lastSyncTime;
    return timeSinceLastSync >= SYNC_COOLDOWN_MS;
  }

  /**
   * Синхронизация с BestBenefits
   * @param force - принудительная синхронизация (игнорирует кулдаун)
   */
  async sync(force: boolean = false): Promise<{
    success: boolean;
    message: string;
    synced?: number;
    updated?: number;
    expired?: number;
    cached?: boolean;
    usedFallback?: boolean;
  }> {
    if (!this.shouldSync(force)) {
      const timeLeft = Math.ceil(
        (SYNC_COOLDOWN_MS - (Date.now() - (this.lastSyncTime || 0))) / 1000
      );
      console.log(
        `[SyncManager] ⏭️ Skipping sync (cooldown: ${timeLeft}s remaining)`
      );
      return {
        success: true,
        message: `Синхронизация доступна через ${timeLeft} сек.`,
        cached: true,
      };
    }

    this.isSyncing = true;

    try {
      console.log("[SyncManager] 🔄 Starting sync with BestBenefits...");

      const response = await fetch("/api/discounts/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || `Sync failed: ${response.status}`);
      }

      const result = await response.json();

      // Обновляем время последней синхронизации
      this.lastSyncTime = Date.now();
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, String(this.lastSyncTime));
      }

      console.log("[SyncManager] ✅ Sync completed:", result);

      return {
        success: true,
        message: result.message || "Синхронизация завершена",
        synced: result.synced,
        updated: result.updated,
        expired: result.expired,
        usedFallback: result.usedFallback,
      };
    } catch (error) {
      console.error("[SyncManager] ❌ Sync error:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Ошибка синхронизации",
      };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Сбрасывает кэш синхронизации (для принудительной синхронизации)
   */
  reset(): void {
    this.lastSyncTime = null;
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
    console.log("[SyncManager] 🔄 Cache reset");
  }

  /**
   * Получает время до следующей доступной синхронизации (в секундах)
   */
  getTimeUntilNextSync(): number {
    if (this.lastSyncTime === null) return 0;

    const timeSinceLastSync = Date.now() - this.lastSyncTime;
    const timeLeft = SYNC_COOLDOWN_MS - timeSinceLastSync;

    return timeLeft > 0 ? Math.ceil(timeLeft / 1000) : 0;
  }

  /**
   * Проверяет, происходит ли синхронизация в данный момент
   */
  get isCurrentlySyncing(): boolean {
    return this.isSyncing;
  }

  /**
   * Проверяет, можно ли синхронизировать сейчас
   */
  get canSync(): boolean {
    return this.shouldSync(false);
  }
}

// Singleton instance
export const syncManager = new SyncManager();
