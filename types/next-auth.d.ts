import type { UserRole, MembershipStatus } from "@prisma/client";

declare module "next-auth" {
  interface User {
    role: UserRole;
    membershipStatus: MembershipStatus;
    firstName?: string | null;
    lastName?: string | null;
    avatarUrl?: string | null;
  }

  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      role: UserRole;
      membershipStatus: MembershipStatus;
      firstName?: string | null;
      lastName?: string | null;
      avatarUrl?: string | null;
      originalAdminId?: string; // ID админа при impersonation
      isImpersonating?: boolean; // Флаг режима impersonation
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    membershipStatus: MembershipStatus;
    firstName?: string | null;
    lastName?: string | null;
    avatarUrl?: string | null;
    email?: string | null;
    name?: string | null;
    originalAdminId?: string; // ID админа при impersonation
    isImpersonating?: boolean; // Флаг режима impersonation
  }
}
