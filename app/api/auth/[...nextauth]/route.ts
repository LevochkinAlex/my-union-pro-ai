import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

// Стандартный экспорт для NextAuth 4.24 в Next.js 16 App Router
// NextAuth сам обрабатывает динамические роуты [...nextauth]
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
