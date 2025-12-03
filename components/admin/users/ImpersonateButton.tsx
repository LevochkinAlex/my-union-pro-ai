"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

interface ImpersonateButtonProps {
  userId: string;
  userEmail: string;
}

export default function ImpersonateButton({ userId, userEmail }: ImpersonateButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleImpersonate = async () => {
    if (!confirm(`Войти от имени пользователя ${userEmail}?`)) {
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

      // Редиректим в личный кабинет пользователя
      router.push("/dashboard");
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
      onClick={handleImpersonate}
      disabled={loading}
      className="text-green-600 hover:text-green-700 dark:text-green-400 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
      title="Войти от имени пользователя"
    >
      {loading ? "..." : "👤"}
    </button>
  );
}

