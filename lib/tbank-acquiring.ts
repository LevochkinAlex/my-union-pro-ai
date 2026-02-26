import crypto from "crypto";

export interface TBankInitResponse {
  Success: boolean;
  ErrorCode: string;
  Message?: string;
  Details?: string;
  TerminalKey?: string;
  Status?: string;
  PaymentId?: string;
  OrderId?: string;
  Amount?: number;
  PaymentURL?: string;
}

export interface TBankGetStateResponse {
  Success: boolean;
  ErrorCode: string;
  Message?: string;
  Details?: string;
  TerminalKey?: string;
  Status?: string;
  PaymentId?: string;
  OrderId?: string;
  Amount?: number;
}

function getApiBaseUrl(): string {
  return process.env.TBANK_API_BASE_URL || "https://securepay.tinkoff.ru/v2";
}

export function getTerminalKey(): string {
  return process.env.TBANK_TERMINAL_KEY || "";
}

function getTerminalPassword(): string {
  return process.env.TBANK_TERMINAL_PASSWORD || "";
}

export function isTBankConfigured(): boolean {
  return Boolean(getTerminalKey() && getTerminalPassword());
}

/**
 * Token = SHA256 от конкатенации значений top-level primitive полей + Password.
 * Поля сортируются по ключу; Token и вложенные объекты/массивы исключаются.
 */
export function createTBankToken(payload: Record<string, unknown>): string {
  const password = getTerminalPassword();
  if (!password) return "";

  const tokenFields: Record<string, string> = { Password: password };
  for (const [key, value] of Object.entries(payload)) {
    if (key === "Token") continue;
    if (value === null || value === undefined) continue;
    if (typeof value === "object") continue;
    tokenFields[key] = String(value);
  }

  const sortedValues = Object.keys(tokenFields)
    .sort((a, b) => a.localeCompare(b))
    .map((k) => tokenFields[k])
    .join("");

  return crypto.createHash("sha256").update(sortedValues).digest("hex");
}

async function tbankPost<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  const body = { ...payload, Token: createTBankToken(payload) };
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await response.json()) as T;
  return data;
}

export async function tbankInitPayment(payload: {
  amount: number;
  orderId: string;
  description: string;
  successUrl: string;
  failUrl: string;
  notificationUrl: string;
  customerKey?: string;
  email?: string;
  phone?: string;
}): Promise<TBankInitResponse> {
  const requestPayload: Record<string, unknown> = {
    TerminalKey: getTerminalKey(),
    Amount: payload.amount,
    OrderId: payload.orderId,
    Description: payload.description,
    SuccessURL: payload.successUrl,
    FailURL: payload.failUrl,
    NotificationURL: payload.notificationUrl,
  };

  if (payload.customerKey) requestPayload.CustomerKey = payload.customerKey;
  if (payload.email) requestPayload.DATA = { email: payload.email };
  if (payload.phone) requestPayload.Phone = payload.phone;

  return tbankPost<TBankInitResponse>("/Init", requestPayload);
}

export async function tbankGetState(paymentId: string): Promise<TBankGetStateResponse> {
  return tbankPost<TBankGetStateResponse>("/GetState", {
    TerminalKey: getTerminalKey(),
    PaymentId: paymentId,
  });
}

export function isTBankSuccessStatus(status?: string): boolean {
  return status === "CONFIRMED" || status === "AUTHORIZED";
}

