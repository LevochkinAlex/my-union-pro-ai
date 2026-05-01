"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import VenueBannerUpload from "@/components/partner/VenueBannerUpload";
import RemainingSlotsSelect from "@/components/partner/RemainingSlotsSelect";
import PartnerVenueServiceFields from "@/components/partner/PartnerVenueServiceFields";
import { isValidPartnerVenueServicePair } from "@/lib/partner-venue-service-taxonomy";
import { datetimeLocalValueToIso, isoToDatetimeLocalValue } from "@/lib/datetime-local-form";
import { PARTNER_VENUE_PARTICIPATION_OPTIONS } from "@/lib/partner-venue-participation";
import { backNavLinkButtonClass } from "@/lib/back-nav-link-button";

interface VenueData {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  city: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  bannerUrl: string | null;
  promoCode: string | null;
  promoLabel: string | null;
  conditions: string | null;
  isActive: boolean;
  eventAt: string | null;
  participationMode?: "PROMO_CODE" | "APPLICATION" | null;
  remainingSlots?: number | null;
  serviceCategoryCode?: string | null;
  serviceCode?: string | null;
}

export default function EditVenuePage() {
  const router = useRouter();
  const params = useParams();
  const venueId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    description: "",
    address: "",
    city: "",
    website: "",
    phone: "",
    email: "",
    bannerUrl: "",
    promoCode: "",
    promoLabel: "",
    conditions: "",
    isActive: true,
    eventAt: "",
    participationMode: "PROMO_CODE" as "PROMO_CODE" | "APPLICATION",
    remainingSlots: "",
    serviceCategoryCode: "",
    serviceCode: "",
  });

  const fetchVenue = useCallback(async () => {
    try {
      const res = await fetch(`/api/partner/venues/${venueId}`);
      if (res.ok) {
        const json = await res.json();
        const data: VenueData = json.venue ?? json;
        const catRaw = (data.serviceCategoryCode ?? "").trim();
        const srvRaw = (data.serviceCode ?? "").trim();
        let cat = catRaw;
        let srv = srvRaw;
        if (!isValidPartnerVenueServicePair(cat || null, srv || null)) {
          cat = "";
          srv = "";
        }
        setForm({
          name: data.name || "",
          description: data.description || "",
          address: data.address || "",
          city: data.city || "",
          website: data.website || "",
          phone: data.phone || "",
          email: data.email || "",
          bannerUrl: data.bannerUrl || "",
          promoCode: data.promoCode || "",
          promoLabel: data.promoLabel || "",
          conditions: data.conditions || "",
          isActive: data.isActive,
          eventAt: isoToDatetimeLocalValue(data.eventAt ?? undefined),
          participationMode:
            data.participationMode === "APPLICATION" ? "APPLICATION" : "PROMO_CODE",
          remainingSlots:
            data.remainingSlots != null &&
            Number.isInteger(data.remainingSlots) &&
            data.remainingSlots >= 1 &&
            data.remainingSlots <= 999
              ? String(data.remainingSlots)
              : "",
          serviceCategoryCode: cat,
          serviceCode: srv,
        });
      } else if (res.status === 404) {
        setError("Площадка не найдена");
      } else {
        setError("Не удалось загрузить данные площадки");
      }
    } catch {
      setError("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => {
    fetchVenue();
  }, [fetchVenue]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    if (type === "checkbox") {
      setForm((prev) => ({
        ...prev,
        [name]: (e.target as HTMLInputElement).checked,
      }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Название обязательно");
      return;
    }

    const cat = form.serviceCategoryCode.trim();
    const srv = form.serviceCode.trim();
    if ((cat && !srv) || (!cat && srv)) {
      setError("Выберите и категорию услуг, и услугу — или оставьте оба поля пустыми.");
      return;
    }
    if (cat && srv && !isValidPartnerVenueServicePair(cat, srv)) {
      setError("Некорректная пара «категория услуг» и «услуга».");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { eventAt: eventAtLocal, remainingSlots: slotsRaw, ...rest } = form;
      const remainingSlotsPayload =
        slotsRaw === ""
          ? null
          : (() => {
              const n = parseInt(slotsRaw, 10);
              return Number.isFinite(n) && n >= 1 && n <= 999 ? n : null;
            })();
      const res = await fetch(`/api/partner/venues/${venueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...rest,
          eventAt: datetimeLocalValueToIso(eventAtLocal),
          remainingSlots: remainingSlotsPayload,
          serviceCategoryCode: cat || null,
          serviceCode: srv || null,
        }),
      });

      if (res.ok) {
        router.push("/partner-dashboard/venues");
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Не удалось сохранить");
      }
    } catch {
      setError("Ошибка сети");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Удалить эту площадку? Это действие необратимо.")) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/partner/venues/${venueId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.push("/partner-dashboard/venues");
      } else {
        alert("Не удалось удалить площадку");
      }
    } catch {
      alert("Ошибка сети");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  const promoFieldsDisabled = form.participationMode === "APPLICATION";

  if (error && !form.name) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
        <Link href="/partner-dashboard/venues" className={`${backNavLinkButtonClass} gap-2`}>
          <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Назад к площадкам
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/partner-dashboard/venues" className={`${backNavLinkButtonClass} gap-2`}>
          <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Назад к площадкам
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Редактировать площадку
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            Основная информация
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Название <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>

            <PartnerVenueServiceFields
              categoryValue={form.serviceCategoryCode}
              serviceValue={form.serviceCode}
              onCategoryChange={(categoryId) =>
                setForm((prev) => ({ ...prev, serviceCategoryCode: categoryId, serviceCode: "" }))
              }
              onServiceChange={(serviceId) => setForm((prev) => ({ ...prev, serviceCode: serviceId }))}
              disabled={saving}
            />

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Описание
              </label>
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                rows={3}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Город
              </label>
              <input
                type="text"
                name="city"
                value={form.city}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Адрес
              </label>
              <input
                type="text"
                name="address"
                value={form.address}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div className="sm:col-span-2 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-end sm:gap-x-6">
              <div>
                <label
                  htmlFor="edit-venue-event-at"
                  className="flex flex-wrap items-baseline gap-2 text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  <span>Дата и время проведения</span>
                  <span className="text-xs font-normal text-gray-500 dark:text-gray-400">(необязательно.)</span>
                </label>
                <input
                  id="edit-venue-event-at"
                  type="datetime-local"
                  name="eventAt"
                  value={form.eventAt}
                  onChange={handleChange}
                  className="mt-1 block w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:[color-scheme:dark]"
                />
              </div>
              <div>
                <label
                  htmlFor="edit-venue-participation-mode"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Участие
                </label>
                <select
                  id="edit-venue-participation-mode"
                  name="participationMode"
                  value={form.participationMode}
                  onChange={handleChange}
                  className="mt-1 block w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                >
                  {PARTNER_VENUE_PARTICIPATION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <RemainingSlotsSelect
              id="edit-venue-remaining-slots"
              name="remainingSlots"
              value={form.remainingSlots}
              onChange={handleChange}
              disabled={saving}
            />

            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  name="isActive"
                  checked={form.isActive}
                  onChange={handleChange}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Площадка активна
                </span>
              </label>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            Контактная информация
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Телефон
              </label>
              <input
                type="tel"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Сайт
              </label>
              <input
                type="url"
                name="website"
                value={form.website}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            Промо и условия
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                className={`block text-sm font-medium ${promoFieldsDisabled ? "text-gray-400 dark:text-gray-500" : "text-gray-700 dark:text-gray-300"}`}
              >
                Промокод
              </label>
              <input
                type="text"
                name="promoCode"
                value={form.promoCode}
                onChange={handleChange}
                disabled={promoFieldsDisabled}
                title={promoFieldsDisabled ? "При участии по заявке промокод не используется" : undefined}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:disabled:bg-gray-800/70 dark:disabled:text-gray-500"
              />
            </div>

            <div>
              <label
                className={`block text-sm font-medium ${promoFieldsDisabled ? "text-gray-400 dark:text-gray-500" : "text-gray-700 dark:text-gray-300"}`}
              >
                Название промоакции
              </label>
              <input
                type="text"
                name="promoLabel"
                value={form.promoLabel}
                onChange={handleChange}
                disabled={promoFieldsDisabled}
                title={promoFieldsDisabled ? "При участии по заявке название промоакции не используется" : undefined}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:disabled:bg-gray-800/70 dark:disabled:text-gray-500"
              />
            </div>

            <div className="sm:col-span-2">
              <VenueBannerUpload
                value={form.bannerUrl}
                onChange={(url) => setForm((prev) => ({ ...prev, bannerUrl: url }))}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Ссылка или путь к баннеру (необязательно)
              </label>
              <input
                type="text"
                name="bannerUrl"
                inputMode="url"
                autoComplete="off"
                value={form.bannerUrl}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                placeholder="https://… или /api/uploads/… после загрузки"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Можно вставить полный URL или оставить путь после загрузки — оба варианта допустимы.
              </p>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Условия
              </label>
              <textarea
                name="conditions"
                value={form.conditions}
                onChange={handleChange}
                rows={3}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="order-2 inline-flex w-full min-h-[2.5rem] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-red-600 bg-white/90 px-3 py-2 text-sm font-medium text-red-600 shadow-sm transition hover:border-red-700 hover:bg-red-100 hover:text-red-800 dark:border-red-500 dark:bg-gray-800/90 dark:text-red-400 dark:hover:border-red-400 dark:hover:bg-red-900/45 dark:hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50 sm:order-1 sm:w-auto"
          >
            {deleting ? "Удаление..." : "Удалить площадку"}
          </button>

          <div className="order-1 grid min-w-0 w-full grid-cols-2 gap-3 sm:order-2 sm:ml-auto sm:flex sm:w-auto sm:shrink-0 sm:items-center">
            <Link
              href="/partner-dashboard/venues"
              className="inline-flex min-h-[2.5rem] w-full min-w-0 items-center justify-center whitespace-nowrap rounded-md border border-gray-600 bg-white/90 px-3 py-2 text-center text-sm font-medium text-gray-600 shadow-sm transition hover:border-gray-700 hover:bg-gray-100 hover:text-gray-800 dark:border-gray-500 dark:bg-gray-800/90 dark:text-gray-400 dark:hover:border-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200 sm:w-auto"
            >
              Отмена
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="flex min-h-[2.5rem] min-w-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50 sm:inline-flex sm:min-h-0"
            >
              {saving ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Сохранение...
                </>
              ) : (
                "Сохранить"
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
