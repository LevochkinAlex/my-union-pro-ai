/**
 * ЕСИА (Госуслуги) OAuth 2.0 + OpenID Connect 1.0
 * Документация: Методические рекомендации по использованию ЕСИА (partners.gosuslugi.ru)
 *
 * Особенность: client_secret = base64(PKCS#7 detached signature) подписанный ГОСТ-сертификатом ИС.
 * Подпись создаётся утилитой openssl (с GOST engine) или CryptoPro cryptcp.
 */

import crypto from "crypto";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const ESIA_CLIENT_ID = process.env.ESIA_CLIENT_ID || "MYUNION";
const ESIA_SCOPE = process.env.ESIA_SCOPE || "openid fullname email mobile";

const ESIA_CERT_PATH = process.env.ESIA_CERT_PATH || "";
const ESIA_KEY_PATH = process.env.ESIA_KEY_PATH || "";
const ESIA_CERT_THUMBPRINT = process.env.ESIA_CERT_THUMBPRINT || "";

const isTest = process.env.ESIA_IS_TEST === "true";
const ESIA_BASE = isTest
  ? "https://esia-portal1.test.gosuslugi.ru"
  : "https://esia.gosuslugi.ru";

const ESIA_AUTH_URL = `${ESIA_BASE}/aas/oauth2/ac`;
const ESIA_TOKEN_URL = `${ESIA_BASE}/aas/oauth2/te`;
const ESIA_USERINFO_URL = `${ESIA_BASE}/rs/prns`;
const ESIA_LOGOUT_URL = `${ESIA_BASE}/idp/ext/Logout`;

export function isEsiaConfigured(): boolean {
  return !!(ESIA_CLIENT_ID && (ESIA_CERT_PATH || ESIA_CERT_THUMBPRINT));
}

export function generateState(): string {
  return crypto.randomUUID();
}

/**
 * Timestamp в формате ЕСИА: "YYYY.MM.DD HH:MM:SS +0300"
 */
export function getEsiaTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const offsetMin = -now.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const absOff = Math.abs(offsetMin);
  const offH = String(Math.floor(absOff / 60)).padStart(2, "0");
  const offM = String(absOff % 60).padStart(2, "0");

  return (
    `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ` +
    `${sign}${offH}${offM}`
  );
}

/**
 * Подписывает строку PKCS#7 detached signature (GOST R 34.10-2012).
 * Возвращает base64url-encoded подпись.
 *
 * Поддерживает два режима:
 * 1. openssl с ГОСТ-engine (ESIA_SIGN_TOOL=openssl, нужны ESIA_CERT_PATH + ESIA_KEY_PATH)
 * 2. CryptoPro cryptcp (ESIA_SIGN_TOOL=cryptcp, нужен ESIA_CERT_THUMBPRINT)
 */
export function signClientSecret(message: string): string {
  const tool = process.env.ESIA_SIGN_TOOL || "openssl";

  const tmpDir = os.tmpdir();
  const msgFile = path.join(tmpDir, `esia_msg_${crypto.randomUUID()}.txt`);
  const sigFile = `${msgFile}.sig`;

  try {
    fs.writeFileSync(msgFile, message, "utf8");

    if (tool === "cryptcp") {
      execSync(
        `cryptcp -signf -cert -der -nochain -thumbprint "${ESIA_CERT_THUMBPRINT}" "${msgFile}"`,
        { stdio: "pipe" },
      );
      const sigDer = fs.readFileSync(sigFile);
      return sigDer.toString("base64url");
    }

    // openssl with GOST engine
    const sigDerFile = path.join(tmpDir, `esia_sig_${crypto.randomUUID()}.der`);
    execSync(
      `openssl smime -sign ` +
        `-in "${msgFile}" ` +
        `-signer "${ESIA_CERT_PATH}" ` +
        `-inkey "${ESIA_KEY_PATH}" ` +
        `-engine gost ` +
        `-outform DER ` +
        `-noattr ` +
        `-out "${sigDerFile}"`,
      { stdio: "pipe" },
    );
    const sigDer = fs.readFileSync(sigDerFile);
    try { fs.unlinkSync(sigDerFile); } catch {}
    return sigDer.toString("base64url");
  } finally {
    try { fs.unlinkSync(msgFile); } catch {}
    try { fs.unlinkSync(sigFile); } catch {}
  }
}

export interface EsiaAuthUrlParams {
  redirectUri: string;
  state: string;
  timestamp: string;
}

/**
 * Формирует URL авторизации ЕСИА.
 * client_secret = PKCS#7(scope + timestamp + clientId + state)
 */
export function getEsiaAuthorizeUrl(params: EsiaAuthUrlParams): string {
  const { redirectUri, state, timestamp } = params;
  const scope = ESIA_SCOPE;
  const clientId = ESIA_CLIENT_ID;

  const secretMessage = scope + timestamp + clientId + state;
  const clientSecret = signClientSecret(secretMessage);

  const q = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    scope,
    response_type: "code",
    state,
    timestamp,
    access_type: "online",
  });

  return `${ESIA_AUTH_URL}?${q.toString()}`;
}

export interface EsiaTokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  token_type: string;
  expires_in: number;
  state: string;
}

/**
 * Обменивает authorization_code на access_token.
 */
export async function exchangeCodeForTokens(params: {
  code: string;
  redirectUri: string;
  state: string;
}): Promise<EsiaTokenResponse> {
  const { code, redirectUri, state } = params;
  const timestamp = getEsiaTimestamp();
  const scope = ESIA_SCOPE;
  const clientId = ESIA_CLIENT_ID;

  const secretMessage = scope + timestamp + clientId + state;
  const clientSecret = signClientSecret(secretMessage);

  const body = new URLSearchParams({
    client_id: clientId,
    code,
    grant_type: "authorization_code",
    client_secret: clientSecret,
    state,
    redirect_uri: redirectUri,
    scope,
    timestamp,
    token_type: "Bearer",
  });

  const res = await fetch(ESIA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(
      data.error_description || data.error || "ESIA token exchange failed",
    );
  }
  return data;
}

/**
 * Извлекает oid (идентификатор пользователя) из JWT access_token ЕСИА.
 */
export function extractOidFromToken(accessToken: string): string {
  const parts = accessToken.split(".");
  if (parts.length < 2) throw new Error("Invalid ESIA access_token format");
  const payload = JSON.parse(
    Buffer.from(parts[1], "base64url").toString("utf8"),
  );
  const oid = payload["urn:esia:sbj_id"] || payload.sub || payload.oid;
  if (!oid) throw new Error("No oid found in ESIA access_token");
  return String(oid);
}

export interface EsiaUserInfo {
  oid: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  birthDate?: string;
  gender?: string;
  trusted?: boolean;
  snils?: string;
}

/**
 * Получает персональные данные пользователя из REST API ЕСИА.
 */
export async function getEsiaUserInfo(
  accessToken: string,
  oid: string,
): Promise<EsiaUserInfo | null> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };

  try {
    const prnsRes = await fetch(`${ESIA_USERINFO_URL}/${oid}`, { headers });
    if (!prnsRes.ok) return null;
    const prns = await prnsRes.json();

    return {
      oid: String(oid),
      firstName: prns.firstName ?? undefined,
      lastName: prns.lastName ?? undefined,
      middleName: prns.middleName ?? undefined,
      birthDate: prns.birthDate ?? undefined,
      gender: prns.gender ?? undefined,
      trusted: prns.trusted ?? undefined,
      snils: prns.snils ?? undefined,
    };
  } catch (err) {
    console.error("[ESIA] Failed to fetch user info:", err);
    return null;
  }
}

export interface EsiaContactInfo {
  email?: string;
  phone?: string;
}

/**
 * Получает контактные данные (email, телефон) пользователя.
 */
export async function getEsiaContacts(
  accessToken: string,
  oid: string,
): Promise<EsiaContactInfo> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };

  const result: EsiaContactInfo = {};

  try {
    const ctcRes = await fetch(`${ESIA_USERINFO_URL}/${oid}/ctts?embed=(elements)`, {
      headers,
    });
    if (ctcRes.ok) {
      const ctcData = await ctcRes.json();
      const elements: Array<{ type: string; vrfStu?: string; value?: string }> =
        ctcData?.elements ?? ctcData?.list ?? [];

      for (const el of elements) {
        if (el.type === "EML" && el.vrfStu === "VERIFIED" && el.value) {
          result.email = el.value;
        }
        if (el.type === "MBT" && el.vrfStu === "VERIFIED" && el.value) {
          result.phone = el.value;
        }
      }
    }
  } catch (err) {
    console.error("[ESIA] Failed to fetch contacts:", err);
  }

  return result;
}
