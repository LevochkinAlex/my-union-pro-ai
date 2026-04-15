import crypto from "crypto";

export type PartnerInvitePayload = {
  partnerId: string;
  email: string;
  exp: number;
};

const TTL_MS = 14 * 24 * 60 * 60 * 1000;

function getSecret(): string {
  const s = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!s) {
    throw new Error("NEXTAUTH_SECRET is required for partner invite tokens");
  }
  return s;
}

export function signPartnerInvite(partnerId: string, email: string): string {
  const normalized = email.trim().toLowerCase();
  const payload: PartnerInvitePayload = {
    partnerId,
    email: normalized,
    exp: Date.now() + TTL_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const hmac = crypto.createHmac("sha256", getSecret()).update(payloadB64).digest("base64url");
  return `${payloadB64}.${hmac}`;
}

export function verifyPartnerInvite(token: string): PartnerInvitePayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payloadB64, sig] = parts;
    const expected = crypto.createHmac("sha256", getSecret()).update(payloadB64).digest("base64url");
    const a = Buffer.from(sig, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const raw = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as PartnerInvitePayload;
    if (!raw.partnerId || !raw.email || typeof raw.exp !== "number") return null;
    if (Date.now() > raw.exp) return null;
    return {
      partnerId: raw.partnerId,
      email: raw.email.trim().toLowerCase(),
      exp: raw.exp,
    };
  } catch {
    return null;
  }
}
