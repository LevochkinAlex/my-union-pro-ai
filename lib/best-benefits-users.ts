/**
 * BestBenefits Organization API — создание пользователя и смена статуса.
 *
 * Актуальные URL (MyUnion), не использовать /api/profsoyuzy:
 * - POST https://bestbenefits.ru/api/myunion/create_user
 * - POST https://bestbenefits.ru/api/myunion/change_status
 */

import { getBestBenefitsToken } from "@/lib/best-benefits-auth";

/** База org API для интеграции MyUnion */
export const BB_MYUNION_ORG_API_BASE = "https://bestbenefits.ru/api/myunion";

export const BB_MYUNION_CREATE_USER_URL = `${BB_MYUNION_ORG_API_BASE}/create_user`;
export const BB_MYUNION_CHANGE_STATUS_URL = `${BB_MYUNION_ORG_API_BASE}/change_status`;

function resolveOrgApiBase(): string {
  const fallback = BB_MYUNION_ORG_API_BASE;
  const raw = process.env.BB_ORG_API_BASE?.trim().replace(/\/$/, "");
  if (!raw) return fallback;
  if (raw.includes("profsoyuzy")) {
    console.warn(
      "[BestBenefits Users] BB_ORG_API_BASE содержит устаревший /profsoyuzy — принудительно используем /api/myunion",
    );
    return fallback;
  }
  return raw;
}

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

async function getOrgApiBearer(): Promise<string> {
  // Читаем при каждом вызове: при импорте модуля до dotenv.config() (скрипты) env ещё пустой
  const org = process.env.BB_PROFSOYUZY_TOKEN?.trim();
  if (org) {
    return org;
  }
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

async function postToOrganizationApi(
  path: string,
  payload: Record<string, unknown>,
): Promise<OrgApiResponse> {
  const token = await getOrgApiBearer();
  const base = resolveOrgApiBase();
  const pathNorm = path.startsWith("/") ? path : `/${path}`;
  const url = `${base}${pathNorm}`;

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

  if (!response.ok) {
    const errorsPart = data?.errors ? ` | errors: ${JSON.stringify(data.errors)}` : "";
    const msg = data?.message || `HTTP ${response.status}`;
    throw new Error(`[BB ${response.status}] ${msg}${errorsPart}`);
  }

  return data;
}

/**
 * Create user in BestBenefits → POST .../myunion/create_user
 */
export async function createBestBenefitsUser(
  params: CreateUserParams,
): Promise<CreateUserResponse> {
  try {
    const data = (await postToOrganizationApi("/create_user", {
      name: params.name,
      email: params.email,
      password: params.password,
      city_id: params.city_id ?? null,
    })) as CreateUserResponse;

    console.log(
      "[BestBenefits Users] User created via myunion API:",
      BB_MYUNION_CREATE_USER_URL,
    );
    console.log("[BestBenefits Users] User ID:", data.data?.id || "NOT FOUND");
    return data;
  } catch (error) {
    console.error("[BestBenefits Users] Error creating user:", error);
    throw error;
  }
}

/**
 * Change user status in BestBenefits → POST .../myunion/change_status
 */
export async function changeBestBenefitsUserStatus(
  params: ChangeStatusParams,
): Promise<ChangeStatusResponse> {
  try {
    const data = (await postToOrganizationApi("/change_status", {
      id: params.id,
      city: params.city ?? null,
    })) as ChangeStatusResponse;

    console.log(
      "[BestBenefits Users] Status changed via myunion API:",
      BB_MYUNION_CHANGE_STATUS_URL,
    );
    console.log("[BestBenefits Users] User:", data.data?.id);
    return data;
  } catch (error) {
    console.error("[BestBenefits Users] Error changing status:", error);
    throw error;
  }
}

/**
 * Create BestBenefits user for a registered platform user
 *
 * NOTE: BestBenefits API may not return user ID on creation.
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
  const name =
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.email.split("@")[0];

  try {
    const result = await createBestBenefitsUser({
      name,
      email: user.email,
      password: user.password,
      city_id: user.city_id ?? null,
    });

    console.log(
      "[BestBenefits Users] Synced user, email as ID:",
      user.email,
    );

    return {
      bestBenefitsUserId: user.email,
      status: result.status || "success",
    };
  } catch (error) {
    console.error("[BestBenefits Users] Failed to sync user:", user.id, error);
    throw error;
  }
}
