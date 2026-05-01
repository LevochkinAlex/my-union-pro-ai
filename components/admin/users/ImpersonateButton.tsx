"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { adminTableImpersonateOutlineClass } from "@/lib/admin-table-action-styles";

interface ImpersonateButtonProps {
  userId: string;
  userEmail?: string | null;
  /** Подпись кнопки (по умолчанию «Войти как») */
  label?: string;
  /** Например, карточка партнёра в статусе «Заблокирован» — вход от имени запрещён */
  disabled?: boolean;
  /** Дополнительные классы (например `w-full min-h-[2.5rem] px-3 py-2` на странице партнёра) */
  className?: string;
}

export default function ImpersonateButton({
  userId,
  userEmail,
  label = "Войти как",
  disabled = false,
  className,
}: ImpersonateButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleImpersonate = async () => {
    if (disabled) return;
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
      disabled={loading || disabled}
      className={cn(
        adminTableImpersonateOutlineClass,
        "gap-1.5 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      title={
        disabled
          ? "Вход от имени недоступен (учётная запись или партнёр заблокированы)"
          : "Войти от имени пользователя"
      }
    >
      <UserRound className="h-4 w-4 shrink-0" aria-hidden />
      <span className="whitespace-nowrap">{loading ? "Вход…" : label}</span>
    </button>
  );
}

