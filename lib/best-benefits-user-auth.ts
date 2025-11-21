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

// Cache user tokens (user email -> {token, expiry})
const userTokenCache = new Map<string, { token: string; expiry: number }>();

/**
 * Get personal BestBenefits token for a specific user
 * This ensures discounts are activated under the user's account, not organization account
 */
export async function getUserBestBenefitsToken(
  email: string,
  password: string
): Promise<string> {
  // Check cache first
  const cached = userTokenCache.get(email);
  if (cached && cached.expiry > Date.now()) {
    console.log(`[UserAuth] Using cached token for ${email}`);
    return cached.token;
  }

  try {
    console.log(`[UserAuth] Authenticating user: ${email}`);

    const response = await fetch(AUTH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[UserAuth] Authentication failed for ${email}:`, response.status, errorText);
      throw new Error(`User authentication failed: ${response.status} - ${errorText}`);
    }

    const data: AuthResponse = await response.json();

    if (!data.access_token) {
      throw new Error("No access_token in response");
    }

    // Cache token (default expiry: 1 hour)
    const expiresIn = data.expires_in ?? 3600; // 1 hour in seconds
    const expiry = Date.now() + (expiresIn - 60) * 1000; // Refresh 1 minute before expiry

    userTokenCache.set(email, {
      token: data.access_token,
      expiry,
    });

    console.log(`[UserAuth] ✅ User authenticated: ${email}`);
    return data.access_token;
  } catch (error) {
    console.error(`[UserAuth] Error authenticating user ${email}:`, error);
    throw error;
  }
}

/**
 * Clear cached token for a user (useful for testing or force refresh)
 */
export function clearUserToken(email: string): void {
  userTokenCache.delete(email);
  console.log(`[UserAuth] Cleared token for ${email}`);
}

/**
 * Clear all cached user tokens
 */
export function clearAllUserTokens(): void {
  userTokenCache.clear();
  console.log(`[UserAuth] Cleared all user tokens`);
}

