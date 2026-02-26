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
