/**
 * BestBenefits Profsoyuzy API User Management
 * 
 * Manages user creation and status updates in BestBenefits platform
 * Docs: public/best_benefits/profsoyuzy_doc.html
 */

import { getBestBenefitsToken } from "@/lib/best-benefits-auth";

const PROFSOYUZY_API_BASE = "https://bestbenefits.ru/api/profsoyuzy";
const PROFSOYUZY_TOKEN = process.env.BB_PROFSOYUZY_TOKEN;

interface CreateUserParams {
  name: string;
  email: string;
  password: string;
  city_id?: number | null;
}

interface CreateUserResponse {
  status: string;
  message: string;
  data?: {
    id: string;
    name: string;
    email: string;
    city_id?: number | null;
    status: string;
    created_at: string;
  };
}

interface ChangeStatusParams {
  id: string;
  city?: number | null;
}

interface ChangeStatusResponse {
  status: string;
  message: string;
  data?: {
    id: string;
    status: string;
    city?: number | null;
  };
}

/**
 * Get authorization token for Profsoyuzy API
 * Uses direct token if available, otherwise falls back to auth flow
 */
async function getProfsoyuzyToken(): Promise<string> {
  // Use direct token if available (preferred)
  if (PROFSOYUZY_TOKEN) {
    return PROFSOYUZY_TOKEN;
  }
  
  // Fallback to regular auth flow
  return getBestBenefitsToken();
}

/**
 * Create user in BestBenefits system
 * This should be called after user registers on our platform
 */
export async function createBestBenefitsUser(
  params: CreateUserParams
): Promise<CreateUserResponse> {
  try {
    const token = await getProfsoyuzyToken();

    const response = await fetch(`${PROFSOYUZY_API_BASE}/create_user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      body: JSON.stringify({
        name: params.name,
        email: params.email,
        password: params.password,
        city_id: params.city_id ?? null,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[BestBenefits Users] Create user failed:", response.status, data);
      throw new Error(
        `Failed to create user in BestBenefits: ${data.message || response.statusText}`
      );
    }

    console.log("[BestBenefits Users] User created successfully. Full response:", JSON.stringify(data, null, 2));
    console.log("[BestBenefits Users] User ID:", data.data?.id || data.id || data.user_id || 'NOT FOUND');
    return data;
  } catch (error) {
    console.error("[BestBenefits Users] Error creating user:", error);
    throw error;
  }
}

/**
 * Change user status in BestBenefits system
 */
export async function changeBestBenefitsUserStatus(
  params: ChangeStatusParams
): Promise<ChangeStatusResponse> {
  try {
    const token = await getProfsoyuzyToken();

    const response = await fetch(`${PROFSOYUZY_API_BASE}/change_status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      body: JSON.stringify({
        id: params.id,
        city: params.city ?? null,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[BestBenefits Users] Change status failed:", response.status, data);
      throw new Error(
        `Failed to change user status in BestBenefits: ${data.message || response.statusText}`
      );
    }

    console.log("[BestBenefits Users] Status changed successfully:", data.data?.id);
    return data;
  } catch (error) {
    console.error("[BestBenefits Users] Error changing status:", error);
    throw error;
  }
}

/**
 * Create BestBenefits user for a registered platform user
 * This is a helper that combines user data from our platform
 * 
 * NOTE: BestBenefits API does NOT return user ID on creation.
 * We use EMAIL as the identifier since it's unique.
 */
export async function syncUserToBestBenefits(user: {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  password: string;
  city_id?: number | null;
}): Promise<{ bestBenefitsUserId: string; status: string }> {
  // Generate full name
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email.split("@")[0];

  try {
    const result = await createBestBenefitsUser({
      name,
      email: user.email,
      password: user.password,
      city_id: user.city_id ?? null,
    });

    // BestBenefits API не возвращает user_id, используем email как идентификатор
    // Email уникален и принимается API для всех операций
    console.log("[BestBenefits Users] User created successfully, using email as ID:", user.email);

    return {
      bestBenefitsUserId: user.email, // Используем email как ID
      status: result.status || "success",
    };
  } catch (error) {
    console.error("[BestBenefits Users] Failed to sync user:", user.id, error);
    throw error;
  }
}

