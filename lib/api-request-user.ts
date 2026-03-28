import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBearerToken, verifyMobileAccessToken } from "@/lib/mobile-auth";

export type RequestUser = {
  id: string;
  source: "session" | "mobile_bearer";
};

/**
 * Resolves the current user for API routes: NextAuth session (web) or Bearer JWT (mobile app).
 */
export async function getRequestUserId(request: NextRequest): Promise<RequestUser | null> {
  const bearer = getBearerToken(request);
  if (bearer) {
    try {
      const { userId } = verifyMobileAccessToken(bearer);
      if (userId) {
        return { id: userId, source: "mobile_bearer" };
      }
    } catch {
      // Invalid bearer — fall through to session
    }
  }

  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    return { id: session.user.id, source: "session" };
  }

  return null;
}
