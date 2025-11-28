"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import UserDetailsForm from "@/components/admin/users/UserDetailsForm";
import { User } from "@prisma/client";

export default function AdminUserDetailsPage() {
  const params = useParams();
  const userId = params.id as string;
  const { data: session } = useSession();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUser = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      // Это API пока не существует, но мы его создадим
      const response = await fetch(`/api/admin/users/${userId}`);
      if (!response.ok) {
        throw new Error("Не удалось загрузить данные пользователя");
      }
      const data = await response.json();
      setUser(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  if (loading) {
    return <div className="p-8">Загрузка данных пользователя...</div>;
  }

  if (error) {
    return <div className="p-8 text-red-500">{error}</div>;
  }
  
  if (!user) {
    return <div className="p-8">Пользователь не найден.</div>;
  }

  const currentUserId = session?.user?.id ?? "";

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center gap-4">
        <Link href="/admin/users" className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400">
          ← Назад к списку пользователей
        </Link>
      </div>
      <h1 className="mb-6 text-3xl font-bold text-gray-900 dark:text-white">
        Пользователь {user.email}
      </h1>
      <UserDetailsForm
        currentUserId={currentUserId}
        user={{
          id: user.id,
          email: user.email!,
          firstName: user.firstName ?? "",
          lastName: user.lastName ?? "",
          middleName: user.middleName ?? "",
          phone: user.phone ?? "",
          dateOfBirth: user.dateOfBirth ? new Date(user.dateOfBirth).toISOString() : null,
          address: user.address,
          jobTitle: user.jobTitle,
          profession: user.profession,
          education: user.education,
          role: user.role,
          membershipStatus: user.membershipStatus,
          createdAt: new Date(user.createdAt).toISOString(),
          updatedAt: new Date(user.updatedAt).toISOString(),
        }}
      />
    </div>
  );
}


