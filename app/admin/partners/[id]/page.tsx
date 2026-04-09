"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import ImpersonateButton from "@/components/admin/users/ImpersonateButton";
import { alertError, alertSuccess } from "@/lib/alert";

type PartnerForm = {
  name: string;
  description: string;
  website: string;
  inn: string;
  address: string;
  phone: string;
  email: string;
  contactLastName: string;
  contactFirstName: string;
  contactMiddleName: string;
  contactEmail: string;
  contactPhone: string;
  contactJobTitle: string;
  linkedUserId: string;
  isActive: boolean;
};

const emptyForm = (): PartnerForm => ({
  name: "",
  description: "",
  website: "",
  inn: "",
  address: "",
  phone: "",
  email: "",
  contactLastName: "",
  contactFirstName: "",
  contactMiddleName: "",
  contactEmail: "",
  contactPhone: "",
  contactJobTitle: "",
  linkedUserId: "",
  isActive: true,
});

export default function PartnerEditPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params?.id === "string" ? params.id : "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formData, setFormData] = useState<PartnerForm>(emptyForm);
  const [linkedUserEmail, setLinkedUserEmail] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/partners/${id}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(typeof data.error === "string" ? data.error : "Не удалось загрузить партнёра");
        return;
      }
      const p = data.partner;
      if (!p) {
        setLoadError("Партнёр не найден");
        return;
      }
      setFormData({
        name: p.name ?? "",
        description: p.description ?? "",
        website: p.website ?? "",
        inn: p.inn ?? "",
        address: p.address ?? "",
        phone: p.phone ?? "",
        email: p.email ?? "",
        contactLastName: p.contactLastName ?? "",
        contactFirstName: p.contactFirstName ?? "",
        contactMiddleName: p.contactMiddleName ?? "",
        contactEmail: p.contactEmail ?? "",
        contactPhone: p.contactPhone ?? "",
        contactJobTitle: p.contactJobTitle ?? "",
        linkedUserId: p.linkedUserId ?? p.linkedUser?.id ?? "",
        isActive: p.isActive !== false,
      });
      setLinkedUserEmail(p.linkedUser?.email ?? null);
    } catch {
      setLoadError("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    const name = formData.name.trim();
    if (!name) {
      alertError("Укажите название партнёра.", "Партнеры");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/partners/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: formData.description.trim() || null,
          website: formData.website.trim() || null,
          inn: formData.inn.trim() || null,
          address: formData.address.trim() || null,
          phone: formData.phone.trim() || null,
          email: formData.email.trim() || null,
          contactLastName: formData.contactLastName.trim() || null,
          contactFirstName: formData.contactFirstName.trim() || null,
          contactMiddleName: formData.contactMiddleName.trim() || null,
          contactEmail: formData.contactEmail.trim() || null,
          contactPhone: formData.contactPhone.trim() || null,
          contactJobTitle: formData.contactJobTitle.trim() || null,
          linkedUserId: formData.linkedUserId.trim() ? formData.linkedUserId.trim() : null,
          isActive: formData.isActive,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alertError(typeof data.error === "string" ? data.error : "Ошибка сохранения", "Партнеры");
        return;
      }
      alertSuccess("Изменения сохранены.", "Партнеры");
      if (data.partner?.linkedUser?.email !== undefined) {
        setLinkedUserEmail(data.partner.linkedUser.email);
      }
      router.refresh();
    } catch {
      alertError("Ошибка сети", "Партнеры");
    } finally {
      setSaving(false);
    }
  };

  if (!id) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
        Некорректная ссылка
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <Link href="/admin/partners" className="text-blue-600 hover:underline dark:text-blue-400">
          ← К списку партнёров
        </Link>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {loadError}
        </div>
      </div>
    );
  }

  const impersonateId = formData.linkedUserId.trim();
  const impersonateEmail = linkedUserEmail?.trim() || "";

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/admin/partners" className="text-blue-600 hover:underline dark:text-blue-400">
          ← К списку партнёров
        </Link>
        {impersonateId && impersonateEmail ? (
          <ImpersonateButton userId={impersonateId} userEmail={impersonateEmail} label="Войти как" />
        ) : null}
      </div>

      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Редактирование партнёра</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Измените данные и нажмите «Сохранить».</p>
      </div>

      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div>
          <label htmlFor="edit-partner-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Название партнёра *
          </label>
          <input
            id="edit-partner-name"
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
            disabled={saving}
          />
        </div>

        <div>
          <label htmlFor="edit-partner-desc" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Описание
          </label>
          <textarea
            id="edit-partner-desc"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
            rows={3}
            disabled={saving}
          />
        </div>

        <div>
          <label htmlFor="edit-partner-website" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Сайт
          </label>
          <input
            id="edit-partner-website"
            type="url"
            value={formData.website}
            onChange={(e) => setFormData({ ...formData, website: e.target.value })}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
            disabled={saving}
          />
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-800/50">
          <h3 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">Реквизиты юр. лица (фирмы/партнера)</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="edit-partner-inn" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                ИНН
              </label>
              <input
                id="edit-partner-inn"
                type="text"
                value={formData.inn}
                onChange={(e) => setFormData({ ...formData, inn: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                disabled={saving}
              />
            </div>
            <div>
              <label htmlFor="edit-partner-phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Телефон
              </label>
              <input
                id="edit-partner-phone"
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                disabled={saving}
              />
            </div>
          </div>
          <div className="mt-4">
            <label htmlFor="edit-partner-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Email
            </label>
            <input
              id="edit-partner-email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
              disabled={saving}
            />
          </div>
          <div className="mt-4">
            <label htmlFor="edit-partner-address" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Адрес
            </label>
            <textarea
              id="edit-partner-address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
              rows={2}
              disabled={saving}
            />
          </div>
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
          <h3 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
            Контактное лицо <span className="font-normal text-gray-500">(необязательно)</span>
          </h3>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label htmlFor="edit-contact-last" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Фамилия
              </label>
              <input
                id="edit-contact-last"
                type="text"
                value={formData.contactLastName}
                onChange={(e) => setFormData({ ...formData, contactLastName: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                disabled={saving}
              />
            </div>
            <div>
              <label htmlFor="edit-contact-first" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Имя
              </label>
              <input
                id="edit-contact-first"
                type="text"
                value={formData.contactFirstName}
                onChange={(e) => setFormData({ ...formData, contactFirstName: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                disabled={saving}
              />
            </div>
            <div>
              <label htmlFor="edit-contact-middle" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Отчество
              </label>
              <input
                id="edit-contact-middle"
                type="text"
                value={formData.contactMiddleName}
                onChange={(e) => setFormData({ ...formData, contactMiddleName: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                disabled={saving}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="edit-contact-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Email
              </label>
              <input
                id="edit-contact-email"
                type="email"
                value={formData.contactEmail}
                onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                disabled={saving}
              />
            </div>
            <div>
              <label htmlFor="edit-contact-phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Телефон
              </label>
              <input
                id="edit-contact-phone"
                type="tel"
                value={formData.contactPhone}
                onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                disabled={saving}
              />
            </div>
          </div>

          <div className="mt-4">
            <label htmlFor="edit-contact-job" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Должность
            </label>
            <input
              id="edit-contact-job"
              type="text"
              value={formData.contactJobTitle}
              onChange={(e) => setFormData({ ...formData, contactJobTitle: e.target.value })}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
              disabled={saving}
            />
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-800/50">
          <h3 className="mb-2 text-base font-semibold text-gray-900 dark:text-white">
            Вход от имени пользователя <span className="font-normal text-gray-500">(необязательно)</span>
          </h3>
          <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
            ID пользователя из админки. Нужен для кнопки «Войти как» в списке партнёров.
          </p>
          <label htmlFor="edit-linked-user" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            ID пользователя
          </label>
          <input
            id="edit-linked-user"
            type="text"
            value={formData.linkedUserId}
            onChange={(e) => setFormData({ ...formData, linkedUserId: e.target.value })}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm dark:border-gray-600 dark:bg-gray-700"
            placeholder="Оставьте пустым, чтобы сбросить привязку"
            autoComplete="off"
            disabled={saving}
          />
        </div>

        <div>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="mr-2"
              disabled={saving}
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Активна</span>
          </label>
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-3">
        <Link
          href="/admin/partners"
          className="rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          Отмена
        </Link>
        <button
          type="button"
          onClick={handleSave}
          disabled={!formData.name.trim() || saving}
          className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
      </div>
    </div>
  );
}
