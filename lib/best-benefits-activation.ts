/**
 * BestBenefits Discount Activation Module
 * 
 * Handles discount activation/claiming for users
 * Uses PERSONAL user tokens, not organization token
 */

import { getBestBenefitsToken } from "@/lib/best-benefits-auth"; // For organization operations
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
  data?: {
    activated: boolean;
    activatedAt?: string;
    promo_code?: string;
    promoCode?: string;
    code?: string;
    expiresAt?: string;
  };
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
      console.log("[BestBenefits Activation] Using PERSONAL token for user:", params.email);
      token = await getUserBestBenefitsToken(params.email, params.password);
    } else {
      // Fallback to organization token (legacy, not recommended)
      console.warn("[BestBenefits Activation] ⚠️ Using organization token - discounts won't be personal!");
      token = await getBestBenefitsToken();
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

    console.log("[BestBenefits Activation] 🔄 Attempting activation via /promo endpoint:", {
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

    console.log("[BestBenefits Activation] ========================================");
    console.log("[BestBenefits Activation] Response status:", response.status, response.statusText);
    console.log("[BestBenefits Activation] Response headers:", Object.fromEntries(response.headers.entries()));
    console.log("[BestBenefits Activation] ========================================");

    // Всегда читаем тело ответа как текст сначала для подробного логирования
    const responseText = await response.text();
    console.log("[BestBenefits Activation] Raw response body:", responseText);

    if (!response.ok) {
      console.error("[BestBenefits Activation] ❌ HTTP error:", {
        status: response.status,
        statusText: response.statusText,
        body: responseText,
      });
      
      return {
        status: "error",
        success: false,
        message: `Activation failed: ${response.status} - ${responseText}`,
      };
    }

    // Парсим JSON
    let data;
    try {
      data = JSON.parse(responseText);
      console.log("[BestBenefits Activation] ✅ Parsed JSON response:", JSON.stringify(data, null, 2));
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
    const promoCode = data.data?.code || null;
    
    console.log("[BestBenefits Activation] Extracted promo code:", promoCode);
    
    if (data.status === "success" && promoCode) {
      return {
        status: "success",
        success: true,
        promoCode: promoCode,
        message: data.message || "Промокод получен",
        data: data.data,
      };
    } else {
      // Ошибка активации (400 - лимит купонов, коды закончились и т.д.)
      return {
        status: "error",
        success: false,
        message: data.message || "Не удалось получить промокод",
      };
    }
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
      console.warn("[BestBenefits Activation] ⚠️ Using organization token for check");
      token = await getBestBenefitsToken();
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
): Promise<Array<{ id: number; promoCode?: string }>> {
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
      let token: string;
      
      if (password) {
        console.log("[BestBenefits Activation] Using PERSONAL token for user:", bestBenefitsUserId);
        token = await getUserBestBenefitsToken(bestBenefitsUserId, password);
      } else {
        console.warn("[BestBenefits Activation] ⚠️ Using organization token - may not see user's personal discounts!");
        token = await getBestBenefitsToken();
      }

      console.log(`[BestBenefits Activation] Fetching activated discounts for user: ${bestBenefitsUserId} (attempt ${attempt + 1}/${retries + 1})`);

      // ✅ Используем правильный endpoint согласно документации с timeout
      const response = await fetchWithTimeout(
        `${ACTIVATION_API_BASE}/received`,
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
        console.warn(`[BestBenefits Activation] HTTP ${response.status} on attempt ${attempt + 1}:`, errorText);
        
        // Если это 5xx ошибка (серверная), пробуем еще раз
        if (response.status >= 500 && attempt < retries) {
          console.log(`[BestBenefits Activation] Server error ${response.status}, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Exponential backoff
          continue;
        }
        
        // Если это клиентская ошибка (4xx) - не пробуем снова, но НЕ используем fallback
        // Промокоды должны быть только из BestBenefits API, иначе они могут быть невалидными
        if (response.status >= 400 && response.status < 500) {
          console.error(`[BestBenefits Activation] Client error ${response.status}, returning empty array (no fallback to prevent invalid promo codes)`);
          return [];
        }
        
        // Для других ошибок пробуем еще раз
        if (attempt < retries) {
          console.log(`[BestBenefits Activation] Retrying after error on attempt ${attempt + 1}...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          continue;
        }
        
        // Если все попытки провалились - возвращаем пустой массив
        // НЕ используем fallback, чтобы не показывать невалидные промокоды
        console.error("[BestBenefits Activation] All retries exhausted, returning empty array (no fallback to prevent invalid promo codes)");
        return [];
      }

      const data = await response.json();
      console.log("[BestBenefits Activation] API Response:", JSON.stringify(data, null, 2));
      
      // Проверяем структуру ответа - может быть data.data или просто data
      let activatedProducts: any[] = [];
      if (data.data && Array.isArray(data.data)) {
        activatedProducts = data.data;
      } else if (Array.isArray(data)) {
        activatedProducts = data;
      } else if (data.products && Array.isArray(data.products)) {
        // Альтернативный формат: { products: [...] }
        activatedProducts = data.products;
      } else {
        console.warn("[BestBenefits Activation] ⚠️ Unexpected API response structure:", Object.keys(data));
        activatedProducts = [];
      }
      
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
      
      console.log("[BestBenefits Activation] Found activated discounts:", activatedProducts.length);
      console.log("[BestBenefits Activation] Raw products data:", JSON.stringify(activatedProducts, null, 2));
    
    // Extract discount IDs and promo codes
    // Каждый продукт может иметь несколько кодов, берем первый активный
    const result = activatedProducts.map((p: any) => {
      const id = p.id;
      // Берем первый активный код (если есть)
      // Проверяем разные варианты структуры данных
      let promoCode: string | undefined = undefined;
      
      if (p.codes && Array.isArray(p.codes) && p.codes.length > 0) {
        console.log(`[BestBenefits Activation] Product ${id} has ${p.codes.length} codes, searching for active one...`);
        
        // Ищем первый активный код с неистекшей датой
        const now = new Date();
        const activeCode = p.codes.find((c: any, index: number) => {
          const code = c?.code || c?.promo_code || c?.promoCode;
          const endDate = c?.end_date || c?.endDate || c?.end_date_time;
          
          console.log(`[BestBenefits Activation] Checking code ${index + 1}/${p.codes.length} for product ${id}:`, {
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
            console.log(`[BestBenefits Activation] Code ${index + 1} is invalid:`, code);
            return false;
          }
          
          // Проверяем дату окончания действия промокода
          if (endDate) {
            try {
              const expirationDate = new Date(endDate);
              // Сравниваем только даты (без времени)
              const expirationDateOnly = new Date(expirationDate.getFullYear(), expirationDate.getMonth(), expirationDate.getDate());
              const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
              
              // Промокод действителен, если дата окончания >= сегодня
              if (expirationDateOnly < nowDateOnly) {
                console.log(`[BestBenefits Activation] Promo code ${code} expired on ${endDate} (today: ${nowDateOnly.toISOString()})`);
                return false;
              } else {
                console.log(`[BestBenefits Activation] ✅ Promo code ${code} is valid until ${endDate}`);
              }
            } catch (error) {
              console.warn(`[BestBenefits Activation] Failed to parse end_date for code ${code}:`, endDate, error);
              // При ошибке парсинга считаем промокод валидным
            }
          } else {
            console.log(`[BestBenefits Activation] Code ${code} has no end_date, considering valid`);
          }
          
          return true;
        });
        
        if (activeCode) {
          const code = activeCode.code || activeCode.promo_code || activeCode.promoCode;
          // Нормализуем: строки "null" и "undefined" игнорируем
          if (code && code.toLowerCase() !== 'null' && code.toLowerCase() !== 'undefined') {
            promoCode = code;
            console.log(`[BestBenefits Activation] ✅ Found active promo code for product ${id}:`, promoCode);
          } else {
            console.log(`[BestBenefits Activation] ⚠️ Active code found but invalid:`, code);
          }
        } else {
          console.log(`[BestBenefits Activation] ⚠️ No active code found for product ${id} (checked ${p.codes.length} codes)`);
        }
      } else if (p.promo_code) {
        // Прямое поле promo_code - применяем валидацию
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
        // Прямое поле promoCode - применяем валидацию
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
        // Прямое поле code - применяем валидацию
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
      
      console.log("[BestBenefits Activation] Processing product:", { 
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
      
      return {
        id: id ? parseInt(String(id)) : null,
        promoCode: promoCode?.trim() || undefined,
      };
    }).filter((p: any) => p.id !== null);
    
      console.log("[BestBenefits Activation] Processed discounts:", result);
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[BestBenefits Activation] Error on attempt ${attempt + 1}:`, error);
      
      // Если это последняя попытка, возвращаем пустой массив
      // НЕ используем fallback, чтобы не показывать невалидные промокоды
      if (attempt >= retries) {
        console.error("[BestBenefits Activation] All attempts failed, returning empty array (no fallback to prevent invalid promo codes)", {
          error: lastError.message,
        });
        return [];
      }
      
      // Ждем перед следующей попыткой (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }

  // Если все попытки провалились, возвращаем пустой массив
  // НЕ используем fallback, чтобы не показывать невалидные промокоды
  console.error("[BestBenefits Activation] All retries exhausted, returning empty array (no fallback to prevent invalid promo codes)", {
    error: lastError?.message,
  });
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
}> {
  try {
    console.log("[BestBenefits Activation] Starting activation for discount:", params.discountId);
    
    // Вызываем активацию через правильный endpoint
    const result = await activateBestBenefitsDiscount(params);
    
    console.log("[BestBenefits Activation] Activation result:", {
      status: result.status,
      success: result.success,
      promoCode: result.promoCode,
      message: result.message,
    });
    
    if (result.status === "success" && result.success === true) {
      console.log("[BestBenefits Activation] ✅ Successfully activated on BestBenefits", {
        discountId: params.discountId,
        promoCode: result.promoCode,
      });
      return {
        success: true,
        promoCode: result.promoCode || null,
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
    };
  }
}

