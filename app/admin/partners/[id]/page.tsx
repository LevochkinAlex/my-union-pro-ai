"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import ImpersonateButton from "@/components/admin/users/ImpersonateButton";
import PartnerLogoUpload from "@/components/admin/PartnerLogoUpload";
import { alertError, alertSuccess, alertWarning, confirm } from "@/lib/alert";
import {
  arePartnerRequisitesValid,
  partnerRequisitesDigits,
  PARTNER_INN_MAX,
  PARTNER_KPP_MAX,
  PARTNER_OGRN_MAX,
} from "@/lib/partner-requisites";

type PartnerForm = {
  name: string;
  description: string;
  website: string;
  logoUrl: string;
  inn: string;
  ogrn: string;
  kpp: string;
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
  logoUrl: "",
  inn: "",
  ogrn: "",
  kpp: "",
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
  const { data: session } = useSession();
  const isSuperAdmin = session?.user?.role === "SUPER_ADMIN";

  const params = useParams();
  const router = useRouter();
  const id = typeof params?.id === "string" ? params.id : "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formData, setFormData] = useState<PartnerForm>(emptyForm);
  const [linkedUserEmail, setLinkedUserEmail] = useState<string | null>(null);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const requisitesValid = useMemo(
    () => arePartnerRequisitesValid(formData.inn, formData.ogrn, formData.kpp),
    [formData.inn, formData.ogrn, formData.kpp]
  );

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
        logoUrl: typeof p.logoUrl === "string" ? p.logoUrl : "",
        inn: partnerRequisitesDigits(String(p.inn ?? ""), PARTNER_INN_MAX),
        ogrn: partnerRequisitesDigits(String(p.ogrn ?? ""), PARTNER_OGRN_MAX),
        kpp: partnerRequisitesDigits(String(p.kpp ?? ""), PARTNER_KPP_MAX),
        address: p.address ?? "",
        phone: p.phone ?? "",
        email: p.email ?? "",
        contactLastName: p.contactLastName ?? "",
        contactFirstName: p.contactFirstName ?? "",
        contactMiddleName: p.contactMiddleName ?? "",
        contactEmail: p.contactEmail ?? "",
        contactPhone: p.contactPhone ?? "",
        contactJobTitle: p.contactJobTitle ?? "",
        linkedUserId: p.linkedUserId ?? p.linkedUser?.id ?? p.cabinetUser?.id ?? "",
        isActive: p.isActive !== false,
      });
      setLinkedUserEmail(p.cabinetUser?.email ?? p.linkedUser?.email ?? null);
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
    if (!arePartnerRequisitesValid(formData.inn, formData.ogrn, formData.kpp)) {
      alertError(
        "ИНН: 10 или 12 цифр (или пусто). ОГРН: 13 или 15 цифр (или пусто). КПП: 9 цифр (или пусто). Допускаются только цифры.",
        "Партнеры"
      );
      return;
    }
    setSaving(true);
    try {
      const trimmedLogo = formData.logoUrl.trim();
      const res = await fetch(`/api/admin/partners/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: formData.description.trim() || null,
          website: formData.website.trim() || null,
          // Не передаём logoUrl, если пусто — иначе Prisma получает logoUrl: null при каждом сохранении
          // (поле есть только в свежем client после prisma generate + перезапуск dev).
          ...(trimmedLogo ? { logoUrl: trimmedLogo } : {}),
          inn: formData.inn || null,
          ogrn: formData.ogrn || null,
          kpp: formData.kpp || null,
          address: formData.address.trim() || null,
          phone: formData.phone.trim() || null,
          email: formData.email.trim() || null,
          contactLastName: formData.contactLastName.trim() || null,
          contactFirstName: formData.contactFirstName.trim() || null,
          contactMiddleName: formData.contactMiddleName.trim() || null,
          contactEmail: formData.contactEmail.trim() || null,
          contactPhone: formData.contactPhone.trim() || null,
          contactJobTitle: formData.contactJobTitle.trim() || null,
          ...(isSuperAdmin
            ? {
                linkedUserId: formData.linkedUserId.trim() ? formData.linkedUserId.trim() : null,
              }
            : {}),
          isActive: formData.isActive,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alertError(typeof data.error === "string" ? data.error : "Ошибка сохранения", "Партнеры");
        return;
      }
      alertSuccess("Изменения сохранены.", "Партнеры");
      const p = data.partner as {
        cabinetUser?: { email?: string | null } | null;
        linkedUser?: { email?: string | null } | null;
      };
      if (p?.cabinetUser?.email !== undefined || p?.linkedUser?.email !== undefined) {
        setLinkedUserEmail(p.cabinetUser?.email ?? p.linkedUser?.email ?? null);
      }
      router.refresh();
    } catch {
      alertError("Ошибка сети", "Партнеры");
    } finally {
      setSaving(false);
    }
  };

  const handleSendRegistrationEmail = async () => {
    const email = formData.email.trim().toLowerCase();
    if (!email) {
      alertError("Укажите email в поле «Email» (реквизиты юр. лица).", "Партнеры");
      return;
    }
    setSendingInvite(true);
    try {
      const res = await fetch(`/api/admin/partners/${id}/send-registration-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        sent?: boolean;
        inviteUrl?: string;
      };
      if (!res.ok) {
        alertError(typeof data.error === "string" ? data.error : "Не удалось отправить письмо", "Партнеры");
        return;
      }
      if (data.sent === false) {
        const link = typeof data.inviteUrl === "string" ? data.inviteUrl : "";
        alertWarning(
          link
            ? `Почта не отправлена: на сервере не заданы переменные SMTP (SMTP_HOST, SMTP_USER, SMTP_PASSWORD) или SMTP вернул ошибку. Скопируйте ссылку и передайте партнёру вручную:\n\n${link}`
            : "Почта не отправлена: проверьте настройки SMTP в .env.local.",
          "Партнеры"
        );
      } else {
        alertSuccess(
          "Письмо с ссылкой на регистрацию кабинета партнёра отправлено на указанный email.",
          "Партнеры"
        );
      }
      await load();
    } catch {
      alertError("Ошибка сети", "Партнеры");
    } finally {
      setSendingInvite(false);
    }
  };

  const handleDeletePartner = async () => {
    if (!isSuperAdmin) return;
    const name = formData.name.trim() || "партнёр";
    const agreed = await confirm(
      `Будут безвозвратно удалены: карточка «${name}», все площадки (магазины) и учётная запись кабинета партнёра, если она была создана. Пользователь, привязанный только по полю «ID пользователя» без кабинета, останется в системе. После удаления можно снова создать партнёра с тем же email.\n\nПродолжить?`,
      "Удалить партнёра и данные кабинета",
      "Удалить",
      "Отмена"
    );
    if (!agreed) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/partners/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alertError(typeof data.error === "string" ? data.error : "Не удалось удалить партнёра", "Партнеры");
        return;
      }
      alertSuccess("Партнёр и связанные данные удалены.", "Партнеры");
      router.push("/admin/partners");
      router.refresh();
    } catch {
      alertError("Ошибка сети", "Партнеры");
    } finally {
      setDeleting(false);
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
        {isSuperAdmin ? (
          <button
            type="button"
            onClick={handleDeletePartner}
            disabled={deleting || saving || loading}
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 shadow-sm transition-colors hover:bg-red-50 dark:border-red-800 dark:bg-red-950/20 dark:text-red-400 dark:hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? "Удаление…" : "Удалить партнёра и данные"}
          </button>
        ) : null}
      </div>

      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Редактирование партнёра</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Измените данные и нажмите «Сохранить».</p>
        {impersonateId ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <ImpersonateButton userId={impersonateId} userEmail={impersonateEmail || undefined} label="Войти как" />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Просмотр кабинета от имени партнёра
            </span>
          </div>
        ) : null}
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

        <PartnerLogoUpload
          partnerId={id}
          value={formData.logoUrl}
          onChange={(logoUrl) => setFormData((prev) => ({ ...prev, logoUrl }))}
          disabled={saving}
        />

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-800/50">
          <h3 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">Реквизиты юр. лица (фирмы/партнера)</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <label htmlFor="edit-partner-inn" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                ИНН
              </label>
              <input
                id="edit-partner-inn"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                maxLength={PARTNER_INN_MAX}
                value={formData.inn}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    inn: partnerRequisitesDigits(e.target.value, PARTNER_INN_MAX),
                  })
                }
                className={`mt-1 block w-full rounded-md border px-3 py-2 dark:border-gray-600 dark:bg-gray-700 ${
                  formData.inn.length > 0 &&
                  formData.inn.length !== 10 &&
                  formData.inn.length !== 12
                    ? "border-amber-500 ring-1 ring-amber-500/30 dark:border-amber-600"
                    : "border-gray-300"
                }`}
                placeholder="10 или 12 цифр"
                disabled={saving}
              />
            </div>
            <div>
              <label htmlFor="edit-partner-ogrn" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                ОГРН
              </label>
              <input
                id="edit-partner-ogrn"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                maxLength={PARTNER_OGRN_MAX}
                value={formData.ogrn}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    ogrn: partnerRequisitesDigits(e.target.value, PARTNER_OGRN_MAX),
                  })
                }
                className={`mt-1 block w-full rounded-md border px-3 py-2 dark:border-gray-600 dark:bg-gray-700 ${
                  formData.ogrn.length > 0 &&
                  formData.ogrn.length !== 13 &&
                  formData.ogrn.length !== 15
                    ? "border-amber-500 ring-1 ring-amber-500/30 dark:border-amber-600"
                    : "border-gray-300"
                }`}
                placeholder="13 или 15 цифр"
                disabled={saving}
              />
            </div>
            <div>
              <label htmlFor="edit-partner-kpp" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                КПП
              </label>
              <input
                id="edit-partner-kpp"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                maxLength={PARTNER_KPP_MAX}
                value={formData.kpp}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    kpp: partnerRequisitesDigits(e.target.value, PARTNER_KPP_MAX),
                  })
                }
                className={`mt-1 block w-full rounded-md border px-3 py-2 dark:border-gray-600 dark:bg-gray-700 ${
                  formData.kpp.length > 0 && formData.kpp.length !== 9
                    ? "border-amber-500 ring-1 ring-amber-500/30 dark:border-amber-600"
                    : "border-gray-300"
                }`}
                placeholder="9 цифр"
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
            <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
              На этот адрес можно отправить письмо со ссылкой на регистрацию кабинета партнёра (карточка уже создана в админке).
            </p>
            <button
              type="button"
              onClick={handleSendRegistrationEmail}
              disabled={saving || sendingInvite || !formData.email.trim()}
              className="mt-3 inline-flex items-center rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-800 dark:bg-gray-800 dark:text-blue-300 dark:hover:bg-blue-950/40"
            >
              {sendingInvite ? "Отправка…" : "Отправить приглашение на регистрацию"}
            </button>
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

        {isSuperAdmin ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-800/50">
            <h3 className="mb-2 text-base font-semibold text-gray-900 dark:text-white">
              Вход от имени пользователя <span className="font-normal text-gray-500">(необязательно)</span>
            </h3>
            <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
              Только для суперадмина. Для «Войти как» в списке партнёров используется кабинет по приглашению (если уже есть) или ID пользователя ниже (ручная привязка).
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
        ) : null}

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
          disabled={!formData.name.trim() || !requisitesValid || saving}
          className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
      </div>
    </div>
  );
}
