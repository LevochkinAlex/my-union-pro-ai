/**
 * BestBenefits Organization API User Management
 *
 * Manages user creation and status updates in BestBenefits platform.
 * Supports both legacy `/api/profsoyuzy/*` and current `/api/myunion/*` paths.
 */

import { getBestBenefitsToken } from "@/lib/best-benefits-auth";

const ORG_API_BASES = [
  process.env.BB_ORG_API_BASE?.trim(),
  "https://bestbenefits.ru/api/myunion",
  "https://bestbenefits.ru/api/profsoyuzy",
].filter(Boolean) as string[];

const ORG_TOKEN = process.env.BB_PROFSOYUZY_TOKEN;

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
 * Get authorization token for organization API.
 * Uses direct token if available, otherwise falls back to auth flow
 */
async function getProfsoyuzyToken(): Promise<string> {
  // Use direct token if available (preferred)
  if (ORG_TOKEN) {
    return ORG_TOKEN;
  }
  
  // Fallback to regular auth flow
  return getBestBenefitsToken();
}

type OrgApiResponse = {
  status?: string;
  message?: string;
  data?: any;
  errors?: Record<string, string[]>;
};

async function safeReadJson(response: Response): Promise<OrgApiResponse> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await response.json()) as OrgApiResponse;
  }
  const text = await response.text();
  return {
    status: "error",
    message: text || `HTTP ${response.status}`,
  };
}

async function postToOrganizationApi(path: string, payload: Record<string, unknown>): Promise<OrgApiResponse> {
  const token = await getProfsoyuzyToken();
  let lastError: Error | null = null;

  for (let i = 0; i < ORG_API_BASES.length; i += 1) {
    const base = ORG_API_BASES[i];
    const url = `${base}${path}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await safeReadJson(response);

      // Если endpoint не существует на текущем base, пробуем следующий.
      if (!response.ok && response.status === 404 && i < ORG_API_BASES.length - 1) {
        console.warn(`[BestBenefits Users] Endpoint not found on ${base}, trying next base`);
        continue;
      }

      if (!response.ok) {
        const errorsPart = data?.errors ? ` | errors: ${JSON.stringify(data.errors)}` : "";
        throw new Error(`${data?.message || `HTTP ${response.status}`}${errorsPart}`);
      }

      return data;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      // Для последнего base — отдаём ошибку наружу.
      if (i === ORG_API_BASES.length - 1) {
        break;
      }
    }
  }

  throw lastError || new Error("Organization API request failed");
}

/**
 * Create user in BestBenefits system
 * This should be called after user registers on our platform
 */
export async function createBestBenefitsUser(
  params: CreateUserParams
): Promise<CreateUserResponse> {
  try {
    const data = (await postToOrganizationApi("/create_user", {
      name: params.name,
      email: params.email,
      password: params.password,
      city_id: params.city_id ?? null,
    })) as CreateUserResponse;

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
    const data = (await postToOrganizationApi("/change_status", {
      id: params.id,
      city: params.city ?? null,
    })) as ChangeStatusResponse;

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

