"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface QuickApproveButtonProps {
  userId: string;
  userName: string;
}

export default function QuickApproveButton({ userId, userName }: QuickApproveButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleApprove = async () => {
    if (!confirm(`Одобрить заявку на членство для ${userName}?`)) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/admin/users/${userId}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "APPROVED" }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Ошибка одобрения");
      }

      alert(`✅ ${userName} успешно одобрен`);
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Произошла ошибка");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleApprove}
      disabled={isLoading}
      className="rounded bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
    >
      {isLoading ? "..." : "✓ Одобрить"}
    </button>
  );
}

