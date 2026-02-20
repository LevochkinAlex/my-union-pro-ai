/**
 * VK ID (id.vk.com) OAuth 2.1 + PKCE
 * Документация: https://id.vk.com/about/business/go/docs/ru/vkid/latest/vk-id/connection/api-description
 */

import crypto from "crypto";

const VK_ID_CLIENT_ID = process.env.VK_ID_CLIENT_ID;
const VK_ID_AUTH_URL = "https://id.vk.ru/authorize";
const VK_ID_TOKEN_URL = "https://id.vk.ru/oauth2/auth";
const VK_ID_USER_INFO_URL = "https://id.vk.ru/oauth2/user_info";

export function isVkIdConfigured(): boolean {
  return !!VK_ID_CLIENT_ID;
}

/** Генерирует code_verifier (43–128 символов) и code_challenge (S256) */
export function generatePkce(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}

/** Генерирует state (минимум 32 символа) */
export function generateState(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function getVkIdAuthorizeUrl(params: {
  redirectUri: string;
  codeChallenge: string;
  state: string;
  scope?: string;
}): string {
  const scope = params.scope ?? "vkid.personal_info email phone";
  const q = new URLSearchParams({
    response_type: "code",
    client_id: VK_ID_CLIENT_ID!,
    redirect_uri: params.redirectUri,
    state: params.state,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
    scope,
  });
  return `${VK_ID_AUTH_URL}?${q.toString()}`;
}

export async function exchangeCodeForTokens(params: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
  state: string;
  deviceId: string;
}): Promise<{
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  user_id: string;
  expires_in: number;
}> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
    client_id: VK_ID_CLIENT_ID!,
    device_id: params.deviceId,
    state: params.state,
  });

  const res = await fetch(VK_ID_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || "VK ID token exchange failed");
  }
  return data;
}

export interface VkIdUserInfo {
  user_id?: string;
  first_name?: string;
  last_name?: string;
  avatar?: string;
  email?: string;
  phone?: string;
  sex?: number;
  birthday?: string;
  verified?: boolean;
}

export async function getVkIdUserInfo(accessToken: string): Promise<VkIdUserInfo | null> {
  const body = new URLSearchParams({
    client_id: VK_ID_CLIENT_ID!,
    access_token: accessToken,
  });

  const res = await fetch(VK_ID_USER_INFO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) return null;
  const data = await res.json();
  // API возвращает { user: { user_id, first_name, ... } }; на случай другого формата — fallback на корень
  const raw = data?.user ?? data;
  if (!raw || typeof raw !== "object") return null;
  return raw as VkIdUserInfo;
}
