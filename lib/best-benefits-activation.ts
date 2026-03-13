/**
 * BestBenefits Discount Activation Module
 * 
 * Handles discount activation/claiming for users
 * Uses PERSONAL user tokens, not organization token
 */

import { getUserBestBenefitsToken } from "@/lib/best-benefits-user-auth"; // For user operations

const ACTIVATION_API_BASE = "https://bestbenefits.ru/api";

interface ActivateDiscountParams {
  userId: string; // Our user ID
  bestBenefitsUserId?: string; // BestBenefits user ID if available
  discountId: number; // Product/Discount ID
  email: string; // User email
  password?: string; // User's BestBenefits password (decrypted)
}

interface ActivationResponse {
  status: string;
  message?: string;
  success?: boolean;
  promoCode?: string;
  cardBased?: boolean;
  data?: {
    activated: boolean;
    activatedAt?: string;
    promo_code?: string;
    promoCode?: string;
    code?: string;
    expiresAt?: string;
    end_date?: string;
  };
}

const DEBUG_BB_ACTIVATION = process.env.DEBUG_BB_ACTIVATION === "true";
function debugLog(...args: unknown[]) {
  if (DEBUG_BB_ACTIVATION) {
    console.log(...args);
  }
}

function decodeUnicodeEscapes(input: string): string {
  return input.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
}

function normalizeBestBenefitsMessage(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 1) Try to parse JSON payloads and extract a human message.
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed?.message === "string" && parsed.message.trim()) {
      return decodeUnicodeEscapes(parsed.message.trim());
    }
    if (typeof parsed?.error === "string" && parsed.error.trim()) {
      return decodeUnicodeEscapes(parsed.error.trim());
    }
  } catch {
    // not JSON, continue
  }

  // 2) Decode escaped unicode from plain string payloads.
  return decodeUnicodeEscapes(trimmed);
}

/**
 * Activate/claim a discount for a user in BestBenefits
 * 
 * NOTE: This function may need adjustment based on actual BestBenefits API
 * Check documentation for correct endpoint and payload structure
 */
export async function activateBestBenefitsDiscount(
  params: ActivateDiscountParams
): Promise<ActivationResponse> {
  try {
    // IMPORTANT: Use PERSONAL user token, not organization token!
    let token: string;
    
    if (params.password) {
      // User has BestBenefits account - use their personal token
      debugLog("[BestBenefits Activation] Using PERSONAL token for user:", params.email);
      token = await getUserBestBenefitsToken(params.email, params.password);
    } else {
      // НЕ используем organization token - это может активировать скидки от организации (p-crusader@yandex.ru)
      // Вместо этого возвращаем ошибку
      console.error("[BestBenefits Activation] ❌ Cannot activate discount: no password provided. Cannot use organization token to prevent activating discounts for wrong user.");
      return {
        status: "error",
        success: false,
        message: "Необходимо синхронизировать аккаунт с BestBenefits перед активацией скидок.",
      };
    }

    // ✅ НАЙДЕН ПРАВИЛЬНЫЙ ENDPOINT: POST /api/promo
    // Согласно документации BestBenefits API (openapi (1).json):
    // - Endpoint: POST /api/promo
    // - Body: { "id": product_id }
    // - Returns: { status: "success", data: { code: "ABCD1234", end_date: "..." } }
    const url = `${ACTIVATION_API_BASE}/promo`;
    const payload = {
      id: params.discountId, // ID предложения
    };

    debugLog("[BestBenefits Activation] 🔄 Attempting activation via /promo endpoint:", {
      url,
      payload,
      discountId: params.discountId,
    });
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    debugLog("[BestBenefits Activation] ========================================");
    debugLog("[BestBenefits Activation] Response status:", response.status, response.statusText);
    debugLog("[BestBenefits Activation] Response headers:", Object.fromEntries(response.headers.entries()));
    debugLog("[BestBenefits Activation] ========================================");

    // Всегда читаем тело ответа как текст сначала для подробного логирования
    const responseText = await response.text();
    debugLog("[BestBenefits Activation] Raw response body:", responseText);

    if (!response.ok) {
      console.error("[BestBenefits Activation] ❌ HTTP error:", {
        status: response.status,
        statusText: response.statusText,
        body: responseText,
      });

      const parsedMessage = normalizeBestBenefitsMessage(responseText);
      return {
        status: "error",
        success: false,
        message:
          parsedMessage ||
          (response.status === 429
            ? "Слишком много запросов в BestBenefits. Попробуйте через минуту."
            : response.status === 401
              ? "Ошибка авторизации в BestBenefits. Попробуйте войти заново."
              : `Ошибка BestBenefits (${response.status})`),
      };
    }

    // Парсим JSON
    let data;
    try {
      data = JSON.parse(responseText);
      debugLog("[BestBenefits Activation] ✅ Parsed JSON response:", JSON.stringify(data, null, 2));
    } catch (e) {
      console.error("[BestBenefits Activation] ❌ Failed to parse JSON:", e);
      return {
        status: "error",
        success: false,
        message: `Invalid JSON response: ${responseText}`,
      };
    }
    
    // Формат ответа согласно документации BestBenefits API:
    // {
    //   "status": "success",
    //   "message": "Промокод получен",
    //   "data": {
    //     "id": 456,
    //     "code": "ABCD1234",
    //     "end_date": "2024-11-19T10:00:00Z"
    //   }
    // }
    const rawCode = data.data?.code || data.data?.promo_code || data.data?.promoCode || null;
    const promoCode =
      typeof rawCode === "string" &&
      rawCode.trim().length > 0 &&
      rawCode !== "Промокод деактивирован" &&
      rawCode.toLowerCase() !== "deactivated"
        ? rawCode.trim()
        : null;
    
    debugLog("[BestBenefits Activation] Extracted promo code:", promoCode);
    
    if (data.status === "success") {
      // Некоторые предложения в BB активируются без буквенно-цифрового кода (по карточке/купону)
      return {
        status: "success",
        success: true,
        promoCode,
        cardBased: !promoCode,
        message: data.message || (promoCode ? "Промокод получен" : "Скидка активирована"),
        data: data.data,
      };
    }

    // Ошибка активации (400 - лимит купонов, коды закончились и т.д.)
    return {
      status: "error",
      success: false,
      message: normalizeBestBenefitsMessage(data.message) || "Не удалось получить промокод",
    };
  } catch (error) {
    console.error("[BestBenefits Activation] Exception:", error);
    if (error instanceof Error) {
      console.error("[BestBenefits Activation] Error details:", {
        message: error.message,
        stack: error.stack,
      });
    }
    
    return {
      status: "error",
      success: false,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check if discount is activated for user
 * 
 * ✅ ИСПОЛЬЗУЕТСЯ ПРАВИЛЬНЫЙ ENDPOINT: GET /api/received
 */
export async function checkDiscountActivation(
  bestBenefitsUserId: string,
  discountId: number,
  password?: string
): Promise<boolean> {
  try {
    // Use personal token if password provided
    let token: string;
    
    if (password) {
      token = await getUserBestBenefitsToken(bestBenefitsUserId, password);
    } else {
      // НЕ используем organization token - это может вернуть скидки от организации (p-crusader@yandex.ru)
      console.warn("[BestBenefits Activation] ⚠️ No password provided - cannot check activation without personal token");
      return false;
    }

    // ✅ Используем правильный endpoint согласно документации
    const response = await fetch(
      `${ACTIVATION_API_BASE}/received`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      console.warn("[BestBenefits Activation] Check failed:", response.status);
      return false;
    }

    const data = await response.json();
    const activatedProducts = data.data || [];
    
    return activatedProducts.some((p: any) => p.id === discountId);
  } catch (error) {
    console.error("[BestBenefits Activation] Check error:", error);
    return false;
  }
}

/**
 * Get all activated products for a user from BestBenefits
 * Returns array of activated discount IDs with promo codes
 * 
 * ✅ ИСПОЛЬЗУЕТСЯ ПРАВИЛЬНЫЙ ENDPOINT: GET /api/received
 * 
 * Согласно документации BestBenefits API (openapi (1).json):
 * - Endpoint: GET /api/received
 * - Returns: { data: [{ id: number, name: string, codes: [{ code: string, end_date: string }] }] }
 */
/**
 * Получает активированные скидки с отказоустойчивостью:
 * - Retry при временных ошибках (5xx)
 * - Timeout для предотвращения зависания
 * - ВАЖНО: НЕ использует fallback на локальные данные - только данные из BestBenefits API
 *   Это гарантирует, что промокоды всегда актуальны и валидны
 */
export async function getUserActivatedDiscounts(
  bestBenefitsUserId: string,
  password?: string,
  options?: {
    timeout?: number; // Timeout в миллисекундах (по умолчанию 15 секунд)
    retries?: number; // Количество попыток (по умолчанию 2)
  }
): Promise<Array<{ id: number; promoCode?: string; validUntil?: string }>> {
  const timeout = options?.timeout ?? 15000; // 15 секунд по умолчанию
  const retries = options?.retries ?? 2;

  const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs: number): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeoutMs}ms`);
      }
      throw error;
    }
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Use personal token if password provided
      // ВАЖНО: НЕ используем organization token, чтобы не получить скидки от p-crusader@yandex.ru
      let token: string;
      
      if (password) {
        debugLog("[BestBenefits Activation] Using PERSONAL token for user:", bestBenefitsUserId);
        token = await getUserBestBenefitsToken(bestBenefitsUserId, password);
      } else {
        // НЕ используем organization token - это может вернуть скидки от организации
        // Вместо этого возвращаем пустой массив, чтобы не показывать чужие скидки
        console.warn("[BestBenefits Activation] ⚠️ No password provided - cannot use personal token. Returning empty array to prevent showing organization discounts.");
        return [];
      }

      debugLog(`[BestBenefits Activation] Fetching activated discounts for user: ${bestBenefitsUserId} (attempt ${attempt + 1}/${retries + 1})`);

      // Собираем все страницы (API поддерживает пагинацию)
      let activatedProducts: any[] = [];
      let currentPage = 1;
      let lastPage = 1;
      let fetchSuccess = true;

      do {
        const url = `${ACTIVATION_API_BASE}/received?page=${currentPage}&per_page=50`;
        const response = await fetchWithTimeout(
          url,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          },
          timeout
        );

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          console.warn(`[BestBenefits Activation] HTTP ${response.status} on attempt ${attempt + 1}, page ${currentPage}:`, errorText);
          
          // Если это 5xx ошибка (серверная), пробуем еще раз
          if (response.status >= 500 && attempt < retries) {
            debugLog(`[BestBenefits Activation] Server error ${response.status}, retrying...`);
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Exponential backoff
            fetchSuccess = false;
            break; // выходим из do-while, for retry
          }
          
          // Если это клиентская ошибка (4xx) - не пробуем снова
          if (response.status >= 400 && response.status < 500) {
            if (response.status === 401) {
              console.warn(`[BestBenefits Activation] BB 401 (user token invalid), returning empty array, keeping local data`);
            } else {
              console.error(`[BestBenefits Activation] Client error ${response.status}, returning empty array (no fallback to prevent invalid promo codes)`);
            }
            return [];
          }
          
          if (attempt < retries) {
            debugLog(`[BestBenefits Activation] Retrying after error on attempt ${attempt + 1}...`);
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            fetchSuccess = false;
            break; // выходим из do-while, for retry
          }
          
          console.error("[BestBenefits Activation] All retries exhausted, returning empty array (no fallback to prevent invalid promo codes)");
          return [];
        }

        const data = await response.json();
        if (currentPage === 1) {
          debugLog("[BestBenefits Activation] API Response (page 1):", JSON.stringify(data, null, 2));
        }
        
        lastPage = data?.meta?.last_page ?? 1;
        const pageData: any[] = data.data && Array.isArray(data.data) ? data.data
          : Array.isArray(data) ? data
          : data.products && Array.isArray(data.products) ? data.products
          : [];
        
        activatedProducts = activatedProducts.concat(pageData);
        debugLog(`[BestBenefits Activation] Page ${currentPage}/${lastPage}: got ${pageData.length} items (total: ${activatedProducts.length})`);
        currentPage++;
      } while (currentPage <= lastPage);

      if (!fetchSuccess) continue; // retry for loop
      
      // Формат ответа согласно документации:
      // {
      //   "data": [
      //     {
      //       "id": 101,
      //       "name": "Сеть ресторанов ТОКИО-CITY",
      //       "codes": [
      //         {
      //           "id": 501,
      //           "code": "ABCD1234",
      //           "end_date": "2024-11-19T10:00:00Z"
      //         }
      //       ]
      //     }
      //   ]
      // }
      
      debugLog("[BestBenefits Activation] Found activated discounts:", activatedProducts.length);
      debugLog("[BestBenefits Activation] Raw products data:", JSON.stringify(activatedProducts, null, 2));
    
    // Extract discount IDs and promo codes
    // Каждый продукт может иметь несколько кодов, берем первый активный
    const result = activatedProducts.map((p: any) => {
      const id = p.id;
      // Берем первый активный код (если есть)
      // Проверяем разные варианты структуры данных
      let promoCode: string | undefined = undefined;
      
      if (p.codes && Array.isArray(p.codes) && p.codes.length > 0) {
        debugLog(`[BestBenefits Activation] Product ${id} has ${p.codes.length} codes, searching for active one...`);
        
        // Ищем первый активный код с неистекшей датой
        const now = new Date();
        const activeCode = p.codes.find((c: any, index: number) => {
          const code = c?.code || c?.promo_code || c?.promoCode;
          const endDate = c?.end_date || c?.endDate || c?.end_date_time;
          
          debugLog(`[BestBenefits Activation] Checking code ${index + 1}/${p.codes.length} for product ${id}:`, {
            code,
            endDate,
            codeType: typeof code,
            hasCode: !!code,
          });
          
          // Проверяем валидность кода
          if (!code || 
              typeof code !== 'string' || 
              code.trim().length === 0 || 
              code === 'Промокод деактивирован' ||
              code.toLowerCase() === 'deactivated') {
            debugLog(`[BestBenefits Activation] Code ${index + 1} is invalid:`, code);
            return false;
          }
          
          // Проверяем дату окончания действия промокода
          if (endDate) {
            try {
              const expirationDate = new Date(endDate);
              const now = new Date();
              
              // Проверяем, что дата валидна
              if (isNaN(expirationDate.getTime())) {
                console.warn(`[BestBenefits Activation] Invalid end_date format for code ${code}:`, endDate);
                // При невалидной дате считаем промокод валидным (на всякий случай)
                return true;
              }
              
              // Сравниваем даты: промокод действителен, если дата окончания >= сегодня
              // Используем UTC для избежания проблем с часовыми поясами
              const expirationTime = expirationDate.getTime();
              const nowTime = now.getTime();
              
              debugLog(`[BestBenefits Activation] Date check for code ${code}:`, {
                endDate,
                expirationTime,
                nowTime,
                expirationDateISO: expirationDate.toISOString(),
                nowISO: now.toISOString(),
                isValid: expirationTime >= nowTime,
              });
              
              if (expirationTime < nowTime) {
                debugLog(`[BestBenefits Activation] ⚠️ Promo code ${code} expired on ${endDate} (now: ${now.toISOString()})`);
                return false;
              } else {
                debugLog(`[BestBenefits Activation] ✅ Promo code ${code} is valid until ${endDate}`);
              }
            } catch (error) {
              console.warn(`[BestBenefits Activation] Failed to parse end_date for code ${code}:`, endDate, error);
              // При ошибке парсинга считаем промокод валидным (на всякий случай)
              return true;
            }
          } else {
            debugLog(`[BestBenefits Activation] Code ${code} has no end_date, considering valid`);
          }
          
          return true;
        });
        
        if (activeCode) {
          const code = activeCode.code || activeCode.promo_code || activeCode.promoCode;
          // Нормализуем: строки "null" и "undefined" игнорируем
          if (code && code.toLowerCase() !== 'null' && code.toLowerCase() !== 'undefined') {
            promoCode = code;
            debugLog(`[BestBenefits Activation] ✅ Found active promo code for product ${id}:`, promoCode);
          } else {
            debugLog(`[BestBenefits Activation] ⚠️ Active code found but invalid:`, code);
          }
        } else {
          debugLog(`[BestBenefits Activation] ⚠️ No active code found for product ${id} (checked ${p.codes.length} codes)`);
        }
      } else if (p.promo_code) {
        // Прямое поле promo_code - применяем проверку
        const code = String(p.promo_code).trim();
        if (code && 
            code.length > 0 && 
            code !== 'Промокод деактивирован' &&
            code.toLowerCase() !== 'deactivated' &&
            code.toLowerCase() !== 'null' &&
            code.toLowerCase() !== 'undefined') {
          promoCode = code;
        }
      } else if (p.promoCode) {
        // Прямое поле promoCode - применяем проверку
        const code = String(p.promoCode).trim();
        if (code && 
            code.length > 0 && 
            code !== 'Промокод деактивирован' &&
            code.toLowerCase() !== 'deactivated' &&
            code.toLowerCase() !== 'null' &&
            code.toLowerCase() !== 'undefined') {
          promoCode = code;
        }
      } else if (p.code) {
        // Прямое поле code - применяем проверку
        const code = String(p.code).trim();
        if (code && 
            code.length > 0 && 
            code !== 'Промокод деактивирован' &&
            code.toLowerCase() !== 'deactivated' &&
            code.toLowerCase() !== 'null' &&
            code.toLowerCase() !== 'undefined') {
          promoCode = code;
        }
      }
      
      debugLog("[BestBenefits Activation] Processing product:", { 
        id, 
        promoCode, 
        codesCount: p.codes?.length || 0,
        hasCodesArray: !!p.codes && Array.isArray(p.codes),
        hasPromoCode: !!p.promo_code,
        hasPromoCodeField: !!p.promoCode,
        hasCodeField: !!p.code,
        codes: p.codes ? JSON.stringify(p.codes, null, 2) : 'none',
        productKeys: Object.keys(p),
        raw: JSON.stringify(p, null, 2)
      });
      
      // Извлекаем end_date из активного кода для сохранения validUntil
      let validUntil: string | undefined = undefined;
      if (p.codes && Array.isArray(p.codes) && p.codes.length > 0) {
        const activeCode = p.codes.find((c: any) => {
          const code = c?.code || c?.promo_code || c?.promoCode;
          return code && code.trim() === promoCode;
        });
        if (activeCode) {
          validUntil = activeCode?.end_date || activeCode?.endDate || activeCode?.end_date_time;
        }
      }

      return {
        id: id ? parseInt(String(id)) : null,
        promoCode: promoCode?.trim() || undefined,
        validUntil: validUntil || undefined,
      };
    }).filter((p: any) => p.id !== null);
    
      debugLog("[BestBenefits Activation] Processed discounts:", result);
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isAuthError = lastError.message.includes("401") || lastError.message.includes("User authentication failed");
      if (isAuthError) {
        console.warn(`[BestBenefits Activation] User BB auth failed (attempt ${attempt + 1}), using local data:`, lastError.message);
      } else {
        console.error(`[BestBenefits Activation] Error on attempt ${attempt + 1}:`, error);
      }
      
      // Если это последняя попытка, возвращаем пустой массив
      // НЕ используем fallback, чтобы не показывать невалидные промокоды
      if (attempt >= retries) {
        if (!isAuthError) {
          console.error("[BestBenefits Activation] All attempts failed, returning empty array (no fallback to prevent invalid promo codes)", {
            error: lastError.message,
          });
        }
        return [];
      }
      
      // Ждем перед следующей попыткой (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }

  // Если все попытки провалились, возвращаем пустой массив
  const isAuthError = lastError?.message?.includes("401") || lastError?.message?.includes("User authentication failed");
  if (!isAuthError) {
    console.error("[BestBenefits Activation] All retries exhausted, returning empty array (no fallback to prevent invalid promo codes)", {
      error: lastError?.message,
    });
  }
  return [];
}

/**
 * Simplified activation for current implementation
 * 
 * ✅ ИСПОЛЬЗУЕТСЯ ПРАВИЛЬНЫЙ ENDPOINT: POST /api/promo
 * 
 * Согласно документации BestBenefits API (openapi (1).json):
 * - Endpoint: POST /api/promo
 * - Body: { "id": product_id }
 * - Returns: { status: "success", data: { code: "ABCD1234", end_date: "..." } }
 * 
 * Обработка ошибок:
 * - 400: "У вас достигнут лимит Premium купонов" или "Коды закончились"
 * - 401: Unauthorized (проблема с токеном)
 */
export async function safeActivateDiscount(params: ActivateDiscountParams): Promise<{
  success: boolean;
  promoCode?: string | null;
  cardBased?: boolean;
  message?: string;
}> {
  try {
    debugLog("[BestBenefits Activation] Starting activation for discount:", params.discountId);
    
    // Вызываем активацию через правильный endpoint
    const result = await activateBestBenefitsDiscount(params);
    
    debugLog("[BestBenefits Activation] Activation result:", {
      status: result.status,
      success: result.success,
      promoCode: result.promoCode,
      message: result.message,
    });
    
    if (result.status === "success" && result.success === true) {
      debugLog("[BestBenefits Activation] ✅ Successfully activated on BestBenefits", {
        discountId: params.discountId,
        promoCode: result.promoCode,
      });
      return {
        success: true,
        promoCode: result.promoCode || null,
        cardBased: result.cardBased === true,
        message: result.message,
      };
    }
    
    // API activation failed
    console.error("[BestBenefits Activation] ❌ Failed to activate on BestBenefits:", {
      status: result.status,
      success: result.success,
      message: result.message,
      discountId: params.discountId,
    });
    
    return {
      success: false,
      promoCode: result.promoCode || null, // Может быть null если ошибка
      cardBased: false,
      message: result.message,
    };
  } catch (error) {
    console.error("[BestBenefits Activation] ❌ Exception during activation:", error);
    if (error instanceof Error) {
      console.error("[BestBenefits Activation] Error details:", {
        message: error.message,
        stack: error.stack,
      });
    }
    
    return {
      success: false,
      promoCode: null,
      cardBased: false,
      message: error instanceof Error ? error.message : "Activation exception",
    };
  }
}

