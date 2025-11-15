"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import FirebasePushInit from "./firebase-push-init";
import { LanguageProvider } from "@/lib/language-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider basePath="/api/auth">
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem={true}
        storageKey="myunion-theme"
      >
        <LanguageProvider>
          <FirebasePushInit />
          {children}
        </LanguageProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}

