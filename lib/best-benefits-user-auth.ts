/**
 * BestBenefits User Authentication Module
 * 
 * Handles PERSONAL authentication for each user (not organization)
 * Each user gets their own token for discount activation
 */

interface AuthResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

const AUTH_URL = "https://bestbenefits.ru/api/auth";
const DEBUG_BB_USER_AUTH = process.env.DEBUG_BB_USER_AUTH === "true";
function debugUserAuth(...args: unknown[]) {
  if (DEBUG_BB_USER_AUTH) {
    console.log(...args);
  }
}

// Cache user tokens (user email -> {token, expiry})
const userTokenCache = new Map<string, { token: string; expiry: number }>();

async function resolveBestBenefitsEmailByUserId(userId: string): Promise<string | null> {
  if (userId.includes("@")) {
    return userId;
  }

  try {
    const { prisma } = await import("@/lib/prisma");
    const user = await prisma.user.findUnique({
      where: { bestBenefitsUserId: userId },
      select: { email: true },
    });

    if (user?.email) {
      debugUserAuth(`[UserAuth] Resolved BB user ID ${userId} to email ${user.email}`);
      return user.email;
    }
  } catch (error) {
    console.warn(`[UserAuth] Failed to resolve BB user ID ${userId} to email:`, error);
  }

  return null;
}

/**
 * Get personal BestBenefits token for a specific user
 * This ensures discounts are activated under the user's account, not organization account
 */
export async function getUserBestBenefitsToken(
  emailOrUserId: string,
  password: string
): Promise<string> {
  const resolvedEmail = await resolveBestBenefitsEmailByUserId(emailOrUserId);
  const loginCandidates = Array.from(new Set([
    emailOrUserId,
    resolvedEmail ?? undefined,
  ].filter(Boolean) as string[]));

  // Check cache first for all possible identifiers.
  for (const login of loginCandidates) {
    const cached = userTokenCache.get(login);
    if (cached && cached.expiry > Date.now()) {
      debugUserAuth(`[UserAuth] Using cached token for ${login}`);
      return cached.token;
    }
  }

  let lastError: unknown = null;
  for (const login of loginCandidates) {
    try {
      debugUserAuth(`[UserAuth] Authenticating user with login: ${login}`);

      const response = await fetch(AUTH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: login,
          password,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[UserAuth] Authentication failed for ${login}:`, response.status, errorText);
        lastError = new Error(`User authentication failed: ${response.status} - ${errorText}`);
        continue;
      }

      const data: AuthResponse = await response.json();

      if (!data.access_token) {
        lastError = new Error("No access_token in response");
        continue;
      }

      // Cache token (default expiry: 1 hour)
      const expiresIn = data.expires_in ?? 3600; // 1 hour in seconds
      const expiry = Date.now() + (expiresIn - 60) * 1000; // Refresh 1 minute before expiry

      // Cache under all candidate keys to avoid re-auth on next calls.
      for (const candidate of loginCandidates) {
        userTokenCache.set(candidate, {
          token: data.access_token,
          expiry,
        });
      }

      debugUserAuth(`[UserAuth] ✅ User authenticated: ${login}`);
      return data.access_token;
    } catch (error) {
      lastError = error;
      console.error(`[UserAuth] Error authenticating user ${login}:`, error);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to authenticate user in BestBenefits");
}

/**
 * Clear cached token for a user (useful for testing or force refresh)
 */
export function clearUserToken(email: string): void {
  userTokenCache.delete(email);
  debugUserAuth(`[UserAuth] Cleared token for ${email}`);
}

/**
 * Clear all cached user tokens
 */
export function clearAllUserTokens(): void {
  userTokenCache.clear();
  debugUserAuth(`[UserAuth] Cleared all user tokens`);
}

