"use client";

import { useMemo, useState } from "react";
import Button from "@/components/ui/button/Button";
import { useRouter } from "next/navigation";
import PhoneInput from "@/components/form/PhoneInput";
import AddressInput from "@/components/form/AddressInput";
import DateInput from "@/components/form/DateInput";
import { EDUCATION_LEVELS } from "@/lib/constants/education";
import { capitalizeName } from "@/lib/utils/nameFormatting";

type UserDetailsFormProps = {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    middleName: string;
    phone: string;
    dateOfBirth: string | null;
    address: string | null;
    jobTitle: string | null;
    profession: string | null;
    education: string | null;
    role: string;
    membershipStatus: string;
    createdAt: string;
    updatedAt: string;
  };
  currentUserId?: string;
};

const ROLE_OPTIONS = [
  "SUPER_ADMIN",
  "FEDERAL_CHAIRMAN",
  "REGIONAL_CHAIRMAN",
  "PPO_HEAD",
  "MEMBER",
  "PENDING_MEMBER",
] as const;

const STATUS_OPTIONS = [
  "PENDING_VERIFICATION",
  "PROFILE_INCOMPLETE",
  "DOCUMENTS_PENDING",
  "APPROVED",
  "REJECTED",
  "SUSPENDED",
] as const;

type RoleOption = (typeof ROLE_OPTIONS)[number];
type StatusOption = (typeof STATUS_OPTIONS)[number];

export default function UserDetailsForm({
  user,
  currentUserId,
}: UserDetailsFormProps) {
  const router = useRouter();
  const [formData, setFormData] = useState({
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    middleName: user.middleName ?? "",
    phone: user.phone ?? "",
    dateOfBirth: user.dateOfBirth ? new Date(user.dateOfBirth).toISOString().split('T')[0] : "",
    address: user.address ?? "",
    jobTitle: user.jobTitle ?? "",
    profession: user.profession ?? "",
    education: user.education ?? "",
    role: user.role as RoleOption,
    membershipStatus: user.membershipStatus as StatusOption,
  });
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isDirty = useMemo(() => {
    const originalDate = user.dateOfBirth ? new Date(user.dateOfBirth).toISOString().split('T')[0] : "";
    return (
      formData.firstName !== (user.firstName ?? "") ||
      formData.lastName !== (user.lastName ?? "") ||
      formData.middleName !== (user.middleName ?? "") ||
      formData.phone !== (user.phone ?? "") ||
      formData.dateOfBirth !== originalDate ||
      formData.address !== (user.address ?? "") ||
      formData.jobTitle !== (user.jobTitle ?? "") ||
      formData.profession !== (user.profession ?? "") ||
      formData.education !== (user.education ?? "") ||
      formData.role !== user.role ||
      formData.membershipStatus !== user.membershipStatus
    );
  }, [formData, user]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    let { name, value } = e.target;

    // Автоматическая капитализация для полей ФИО
    if (name === "firstName" || name === "lastName" || name === "middleName") {
      value = capitalizeName(value);
    }

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error ?? "Не удалось сохранить пользователя");
      }

      const data = await response.json();

      setMessage({
        type: "success",
        text: "Данные пользователя сохранены",
      });

      setFormData({
        firstName: data.user.firstName ?? "",
        lastName: data.user.lastName ?? "",
        middleName: data.user.middleName ?? "",
        phone: data.user.phone ?? "",
        dateOfBirth: data.user.dateOfBirth ? new Date(data.user.dateOfBirth).toISOString().split('T')[0] : "",
        address: data.user.address ?? "",
        jobTitle: data.user.jobTitle ?? "",
        profession: data.user.profession ?? "",
        education: data.user.education ?? "",
        role: data.user.role as RoleOption,
        membershipStatus: data.user.membershipStatus as StatusOption,
      });

      router.refresh();
    } catch (error) {
      console.error("[admin/users] save error", error);
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Не удалось сохранить пользователя",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (user.id === currentUserId) {
      setMessage({
        type: "error",
        text: "Нельзя удалить собственный аккаунт",
      });
      return;
    }

    const confirmed = window.confirm(
      "Вы уверены, что хотите удалить пользователя? Это действие нельзя отменить.",
    );
    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error ?? "Не удалось удалить пользователя");
      }

      router.push("/admin/users");
      router.refresh();
    } catch (error) {
      console.error("[admin/users] delete error", error);
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Не удалось удалить пользователя",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
        <div className="mb-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            ID пользователя:{" "}
            <span className="font-mono text-xs text-gray-700 dark:text-gray-300">
              {user.id}
            </span>
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Создан:{" "}
            {new Date(user.createdAt).toLocaleString("ru-RU", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Обновлён:{" "}
            {new Date(user.updatedAt).toLocaleString("ru-RU", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {message && (
            <div
              className={`rounded-lg border px-4 py-3 text-sm ${
                message.type === "success"
                  ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-200"
                  : "border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200"
              }`}
            >
              {message.text}
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Email
              </label>
              <input
                type="email"
                value={user.email}
                disabled
                className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:disabled:bg-gray-800 dark:disabled:text-gray-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Фамилия
              </label>
              <input
                type="text"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Имя
              </label>
              <input
                type="text"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Отчество
              </label>
              <input
                type="text"
                name="middleName"
                value={formData.middleName}
                onChange={handleChange}
                className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Телефон
              </label>
              <PhoneInput
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Дата рождения
              </label>
              <DateInput
                name="dateOfBirth"
                value={formData.dateOfBirth}
                onChange={handleChange}
                placeholder="ДД.ММ.ГГГГ"
                className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Адрес проживания
              </label>
              <AddressInput
                name="address"
                value={formData.address}
                onChange={handleChange}
                placeholder="Начните вводить адрес..."
                className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Должность
              </label>
              <input
                type="text"
                name="jobTitle"
                value={formData.jobTitle}
                onChange={handleChange}
                placeholder="Занимаемая должность"
                className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Профессия
              </label>
              <input
                type="text"
                name="profession"
                value={formData.profession}
                onChange={handleChange}
                placeholder="Основная профессия"
                className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Образование
              </label>
              <div className="relative mt-2">
                <select
                  name="education"
                  value={formData.education}
                  onChange={handleChange}
                  className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-4 py-2.5 pr-12 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                >
                  <option value="">Выберите уровень образования</option>
                  {EDUCATION_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
                <span className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500 dark:text-gray-400">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Роль
              </label>
              <div className="relative mt-2">
                <select
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-4 py-2.5 pr-12 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                <span className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500 dark:text-gray-400">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Статус членства
              </label>
              <div className="relative mt-2">
                <select
                  name="membershipStatus"
                  value={formData.membershipStatus}
                  onChange={handleChange}
                  className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-4 py-2.5 pr-12 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                <span className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500 dark:text-gray-400">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" disabled={saving || !isDirty}>
              {saving ? "Сохранение..." : "Сохранить изменения"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleDelete}
              disabled={deleting || user.id === currentUserId}
              className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/20"
            >
              {deleting ? "Удаление..." : "Удалить пользователя"}
            </Button>
            {user.id === currentUserId && (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Нельзя удалить собственный аккаунт
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}


