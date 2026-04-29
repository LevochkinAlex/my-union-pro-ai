"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import VenueBannerUpload from "@/components/partner/VenueBannerUpload";
import RemainingSlotsSelect from "@/components/partner/RemainingSlotsSelect";
import PartnerVenueServiceFields from "@/components/partner/PartnerVenueServiceFields";
import { isValidPartnerVenueServicePair } from "@/lib/partner-venue-service-taxonomy";
import { datetimeLocalValueToIso } from "@/lib/datetime-local-form";
import { PARTNER_VENUE_PARTICIPATION_OPTIONS } from "@/lib/partner-venue-participation";

export default function NewVenuePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
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
    eventAt: "",
    participationMode: "PROMO_CODE" as "PROMO_CODE" | "APPLICATION",
    remainingSlots: "",
    serviceCategoryCode: "",
    serviceCode: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
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
      const res = await fetch("/api/partner/venues", {
        method: "POST",
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
        setError(data?.error || "Не удалось создать площадку");
      }
    } catch {
      setError("Ошибка сети");
    } finally {
      setSaving(false);
    }
  };

  const promoFieldsDisabled = form.participationMode === "APPLICATION";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/partner-dashboard/venues"
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Новая площадка
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
                placeholder="Название площадки"
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
                placeholder="Описание площадки"
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
                placeholder="Москва"
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
                placeholder="ул. Примерная, д. 1"
              />
            </div>

            <div className="sm:col-span-2 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-end sm:gap-x-6">
              <div>
                <label
                  htmlFor="new-venue-event-at"
                  className="flex flex-wrap items-baseline gap-2 text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  <span>Дата и время проведения</span>
                  <span className="text-xs font-normal text-gray-500 dark:text-gray-400">(необязательно.)</span>
                </label>
                <input
                  id="new-venue-event-at"
                  type="datetime-local"
                  name="eventAt"
                  value={form.eventAt}
                  onChange={handleChange}
                  className="mt-1 block w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:[color-scheme:dark]"
                />
              </div>
              <div>
                <label
                  htmlFor="new-venue-participation-mode"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Участие
                </label>
                <select
                  id="new-venue-participation-mode"
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
              id="new-venue-remaining-slots"
              name="remainingSlots"
              value={form.remainingSlots}
              onChange={handleChange}
              disabled={saving}
            />
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
                placeholder="+7 (999) 123-45-67"
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
                placeholder="venue@example.com"
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
                placeholder="https://example.com"
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
                placeholder="PROMO2024"
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
                placeholder="Скидка 10% для членов профсоюза"
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
                placeholder="Условия получения скидки"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Сохранение...
              </>
            ) : (
              "Создать площадку"
            )}
          </button>
          <Link
            href="/partner-dashboard/venues"
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
          >
            Отмена
          </Link>
        </div>
      </form>
    </div>
  );
}
