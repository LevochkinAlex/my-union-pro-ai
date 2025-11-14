import type { UserRole, MembershipStatus } from "@prisma/client";

declare module "next-auth" {
  interface User {
    role: UserRole;
    membershipStatus: MembershipStatus;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: UserRole;
      membershipStatus: MembershipStatus;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    membershipStatus: MembershipStatus;
  }
}
