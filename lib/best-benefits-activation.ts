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
export async function getUserActivatedDiscounts(
  bestBenefitsUserId: string,
  password?: string
): Promise<Array<{ id: number; promoCode?: string }>> {
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

    console.log("[BestBenefits Activation] Fetching activated discounts for user:", bestBenefitsUserId);

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
      console.warn("[BestBenefits Activation] Failed to fetch activated discounts:", response.status);
      return [];
    }

    const data = await response.json();
    console.log("[BestBenefits Activation] API Response:", JSON.stringify(data, null, 2));
    
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
    const activatedProducts = data.data || [];
    
    console.log("[BestBenefits Activation] Found activated discounts:", activatedProducts.length);
    console.log("[BestBenefits Activation] Raw products data:", activatedProducts);
    
    // Extract discount IDs and promo codes
    // Каждый продукт может иметь несколько кодов, берем первый активный
    const result = activatedProducts.map((p: any) => {
      const id = p.id;
      // Берем первый активный код (если есть)
      const activeCode = p.codes?.find((c: any) => c.code && c.code !== 'Промокод деактивирован');
      const promoCode = activeCode?.code || undefined;
      
      console.log("[BestBenefits Activation] Processing product:", { id, promoCode, codesCount: p.codes?.length, raw: p });
      return {
        id: id ? parseInt(String(id)) : null,
        promoCode: promoCode,
      };
    }).filter((p: any) => p.id !== null);
    
    console.log("[BestBenefits Activation] Processed discounts:", result);
    return result;
  } catch (error) {
    console.error("[BestBenefits Activation] Error fetching activated discounts:", error);
    return [];
  }
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

