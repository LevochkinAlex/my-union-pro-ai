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
      viewMode?: string; // Текущий режим работы: MEMBER или PPO_HEAD
      isPPOHead?: boolean; // Является ли пользователь председателем ППО
      ppoHeadOrganizationId?: string | null; // ID организации председателя
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
