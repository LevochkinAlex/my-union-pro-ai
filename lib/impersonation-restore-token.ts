import { sign, verify } from "jsonwebtoken";
import type { MembershipStatus, UserRole } from "@prisma/client";

const AUD = "impersonation-restore-v1";
const TTL_SEC = 180;

export type ImpersonationRestoreAdminPayload = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  membershipStatus: MembershipStatus;
};

type SignedBody = {
  typ: "imp-restore";
  aud: typeof AUD;
  impersonatedUserId: string;
  admin: ImpersonationRestoreAdminPayload;
};

function getSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is required for impersonation restore");
  }
  return secret;
}

/** Одноразовый (по смыслу) короткий JWT для restore-admin без чтения session cookie внутри authorize. */
export function issueImpersonationRestoreToken(input: {
  admin: ImpersonationRestoreAdminPayload;
  impersonatedUserId: string;
}): string {
  const body: SignedBody = {
    typ: "imp-restore",
    aud: AUD,
    impersonatedUserId: input.impersonatedUserId,
    admin: input.admin,
  };
  return sign(body, getSecret(), { expiresIn: TTL_SEC });
}

export function verifyImpersonationRestoreToken(
  token: string | undefined | null
): SignedBody | null {
  if (!token || typeof token !== "string" || !token.trim()) return null;
  try {
    const decoded = verify(token.trim(), getSecret()) as SignedBody & { exp?: number };
    if (decoded.typ !== "imp-restore" || decoded.aud !== AUD) return null;
    if (!decoded.admin?.id || !decoded.impersonatedUserId) return null;
    return decoded;
  } catch {
    return null;
  }
}
