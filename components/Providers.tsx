"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import FirebasePushInit from "./firebase-push-init";
import { LanguageProvider } from "@/lib/language-context";
import { AlertProvider } from "./providers/AlertProvider";
import ErrorHandler from "./ErrorHandler";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider basePath="/api/auth">
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem={true}
        storageKey="myunion-theme"
        disableTransitionOnChange={false}
      >
        <LanguageProvider>
          <AlertProvider>
            <ErrorHandler />
            <FirebasePushInit />
            {children}
          </AlertProvider>
        </LanguageProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}

