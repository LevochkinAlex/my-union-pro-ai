import type { UserRole, MembershipStatus } from "@prisma/client";

declare module "next-auth" {
  interface User {
    role: UserRole;
    membershipStatus: MembershipStatus;
    firstName?: string | null;
    lastName?: string | null;
    avatarUrl?: string | null;
    isDemo?: boolean; // Демо-режим: без записи в БД
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
      originalAdminId?: string;
      isImpersonating?: boolean;
      /** Снимок админа из JWT при impersonation (для выхода без БД) */
      restoreAdminProfile?: {
        id: string;
        role: UserRole;
        membershipStatus: MembershipStatus;
        email?: string | null;
        firstName?: string | null;
        lastName?: string | null;
      };
      /** Текущий режим кабинета: MEMBER | PPO_HEAD | MPO_HEAD | RPO_HEAD */
      viewMode?: string;
      isPPOHead?: boolean;
      ppoHeadOrganizationId?: string | null;
      isMPOHead?: boolean;
      mpoHeadOrganizationId?: string | null;
      isRPOHead?: boolean;
      rpoHeadOrganizationId?: string | null;
      isDemo?: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  /** Снимок супер-админа при impersonation — для restore-admin, если БД временно недоступна */
  interface RestoreAdminProfileJwt {
    id: string;
    role: UserRole;
    membershipStatus: MembershipStatus;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  }

  interface JWT {
    id: string;
    role: UserRole;
    membershipStatus: MembershipStatus;
    firstName?: string | null;
    lastName?: string | null;
    avatarUrl?: string | null;
    email?: string | null;
    name?: string | null;
    originalAdminId?: string;
    isImpersonating?: boolean;
    restoreAdminProfile?: RestoreAdminProfileJwt;
    isDemo?: boolean;
    viewMode?: string;
    isPPOHead?: boolean;
    ppoHeadOrganizationId?: string | null;
    isMPOHead?: boolean;
    mpoHeadOrganizationId?: string | null;
    isRPOHead?: boolean;
    rpoHeadOrganizationId?: string | null;
  }
}
