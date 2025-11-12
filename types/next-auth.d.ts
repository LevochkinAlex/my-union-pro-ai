import type { Session } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      membershipStatus: string;
    };
  }

  interface User {
    id: string;
    role: string;
    membershipStatus: string;
  }
}
