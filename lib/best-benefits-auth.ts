/**
 * BestBenefits API Authentication Module
 * 
 * Handles authentication with BestBenefits API
 * Docs: https://bestbenefits.ru/api/auth
 */

interface AuthResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

interface AuthCredentials {
  email: string;
  password: string;
}

const AUTH_URL = "https://bestbenefits.ru/api/auth";
const TOKEN_CACHE_KEY = "bb_access_token";
const TOKEN_EXPIRY_KEY = "bb_token_expiry";

// In-memory cache for token (for serverless environments)
let cachedToken: string | null = null;
let tokenExpiry: number = 0;

/**
 * Authenticate with BestBenefits API and get access token
 */
export async function authenticateBestBenefits(): Promise<string> {
  const credentials: AuthCredentials = {
    email: process.env.BB_LOGIN ?? "",
    password: process.env.BB_PASSWORD ?? "",
  };

  if (!credentials.email || !credentials.password) {
    throw new Error("BestBenefits credentials not configured. Set BB_LOGIN and BB_PASSWORD env variables.");
  }

  // Check if we have a valid cached token
  if (cachedToken && tokenExpiry > Date.now()) {
    return cachedToken;
  }

  try {
    const response = await fetch(AUTH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(credentials),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`BestBenefits auth failed: ${response.status} - ${errorText}`);
    }

    const data: AuthResponse = await response.json();

    if (!data.access_token) {
      throw new Error("No access_token in response");
    }

    // Cache token (default expiry: 3 hours if not specified)
    cachedToken = data.access_token;
    const expiresIn = data.expires_in ?? 3 * 60 * 60; // 3 hours in seconds
    tokenExpiry = Date.now() + (expiresIn - 60) * 1000; // Refresh 1 minute before expiry

    return cachedToken;
  } catch (error) {
    console.error("[BestBenefits Auth] Authentication failed:", error);
    throw error;
  }
}

/**
 * Get authenticated Bearer token for BestBenefits API
 * This function ensures we always have a valid token
 */
export async function getBestBenefitsToken(): Promise<string> {
  return authenticateBestBenefits();
}

/**
 * Clear cached token (useful for testing or force refresh)
 */
export function clearBestBenefitsToken(): void {
  cachedToken = null;
  tokenExpiry = 0;
}

