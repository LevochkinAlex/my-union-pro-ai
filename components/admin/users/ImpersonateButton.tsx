"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";

interface ImpersonateButtonProps {
  userId: string;
  userEmail?: string | null;
  /** Подпись кнопки (по умолчанию «Войти») */
  label?: string;
}

export default function ImpersonateButton({ userId, userEmail, label = "Войти" }: ImpersonateButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleImpersonate = async () => {
    const who = userEmail?.trim() || userId;
    if (!confirm(`Войти от имени пользователя ${who}?`)) {
      return;
    }

    setLoading(true);
    try {
      // Получаем данные для impersonation
      const response = await fetch(`/api/admin/users/${userId}/impersonate`, {
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Ошибка при входе от имени пользователя");
      }

      const data = await response.json();

      // Входим через NextAuth с данными impersonation
      const result = await signIn("impersonate", {
        userId: data.targetUser.id,
        originalAdminId: data.originalAdminId,
        redirect: false,
      });

      if (result?.error) {
        throw new Error(result.error);
      }

      const role = data.targetUser?.role as string | undefined;
      router.push(role === "PARTNER" ? "/partner-dashboard" : "/dashboard");
      router.refresh();
    } catch (error) {
      console.error("[Impersonate] Error:", error);
      alert(error instanceof Error ? error.message : "Ошибка при входе от имени пользователя");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleImpersonate}
      disabled={loading}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-green-600 hover:bg-green-50 hover:text-green-700 dark:text-green-400 dark:hover:bg-green-950/30 dark:hover:text-green-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      title="Войти от имени пользователя"
    >
      <UserRound className="h-4 w-4 shrink-0" aria-hidden />
      <span>{loading ? "Вход…" : label}</span>
    </button>
  );
}

