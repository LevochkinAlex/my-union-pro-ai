"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

interface PartnerVenueDetail {
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
  createdAt: string;
  partner: {
    id: string;
    name: string;
    description: string | null;
    website: string | null;
  };
}

export default function PartnerVenueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const venueId = params.id as string;

  const [venue, setVenue] = useState<PartnerVenueDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const loadVenue = useCallback(async () => {
    try {
      const res = await fetch(`/api/partner-venues/public?venueId=${encodeURIComponent(venueId)}`);
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (data.venue) {
        setVenue(data.venue);
      } else if (data.venues?.length > 0) {
        setVenue(data.venues[0]);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => {
    loadVenue();
  }, [loadVenue]);

  const handleCopyPromo = async () => {
    if (!venue?.promoCode || !navigator?.clipboard) return;
    try {
      await navigator.clipboard.writeText(venue.promoCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Площадка не найдена
          </h2>
          <button
            onClick={() => router.push("/dashboard/discounts")}
            className="mt-4 text-blue-600 hover:underline"
          >
            ← Вернуться к скидкам
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20 dark:bg-gray-900">
      <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6 sm:py-8">
        <button
          onClick={() => router.back()}
          className="mb-6 flex items-center gap-2 text-gray-600 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
        >
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
              clipRule="evenodd"
            />
          </svg>
          Назад к скидкам
        </button>

        <div className="overflow-hidden rounded-xl bg-white shadow-lg dark:bg-gray-800">
          {venue.bannerUrl && (
            <div className="relative w-full bg-gray-100 dark:bg-gray-700">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={venue.bannerUrl}
                alt={venue.name}
                className="w-full h-auto max-h-96 object-cover"
              />
              <div className="absolute left-3 top-3">
                <span className="inline-flex items-center rounded-full bg-indigo-600/90 px-3 py-1 text-xs font-semibold text-white shadow">
                  Партнёр
                </span>
              </div>
            </div>
          )}

          {!venue.bannerUrl && (
            <div className="flex min-h-[200px] items-center justify-center bg-gradient-to-br from-indigo-500 via-blue-600 to-cyan-500 p-8 text-center text-white">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide opacity-80">
                  {venue.partner.name}
                </p>
                <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{venue.name}</h1>
              </div>
            </div>
          )}

          <div className="p-4 sm:p-6 md:p-8">
            {venue.bannerUrl && (
              <h1 className="text-xl font-bold text-gray-900 dark:text-white sm:text-2xl md:text-3xl">
                {venue.name}
              </h1>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-4">
              <span className="rounded-full bg-indigo-100 px-3 py-1 text-sm font-medium text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300">
                {venue.partner.name}
              </span>
              {venue.city && (
                <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>{venue.city}</span>
                </div>
              )}
            </div>

            {venue.promoLabel && (
              <div className="mt-4 rounded-lg bg-gradient-to-r from-indigo-50 to-blue-50 p-4 dark:from-indigo-900/20 dark:to-blue-900/20">
                <p className="text-base font-semibold text-indigo-800 dark:text-indigo-200 sm:text-lg">
                  {venue.promoLabel}
                </p>
              </div>
            )}

            {venue.description && (
              <div className="mt-4 sm:mt-6">
                <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
                  <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700 dark:text-gray-300 sm:text-base">
                    {venue.description}
                  </p>
                </div>
              </div>
            )}

            {venue.promoCode && (
              <div className="mt-4 sm:mt-6">
                <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
                  Промокод
                </h3>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
                  <div className="mb-3 flex items-center justify-center">
                    <span className="rounded-lg bg-white px-4 py-2 font-mono text-lg font-bold tracking-wider text-gray-900 shadow-sm dark:bg-gray-900 dark:text-white sm:text-xl">
                      {venue.promoCode}
                    </span>
                  </div>
                  <button
                    onClick={handleCopyPromo}
                    className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition sm:text-base ${
                      copied
                        ? "bg-emerald-500 text-white"
                        : "bg-indigo-600 text-white hover:bg-indigo-700"
                    }`}
                  >
                    {copied ? (
                      <>
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                        Скопировано!
                      </>
                    ) : (
                      <>
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                          <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                        </svg>
                        Скопировать код
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {venue.conditions && (
              <div className="mt-6 sm:mt-8">
                <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white sm:text-xl">
                  Условия
                </h2>
                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-8">
                  <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700 dark:text-gray-300 sm:text-base">
                    {venue.conditions}
                  </p>
                </div>
              </div>
            )}

            {(venue.address || venue.phone || venue.email || venue.website) && (
              <div className="mt-6 sm:mt-8">
                <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white sm:text-xl">
                  Контакты
                </h2>
                <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                  {venue.address && (
                    <div className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
                      <svg className="mt-0.5 h-5 w-5 flex-none text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span>{venue.address}</span>
                    </div>
                  )}
                  {venue.phone && (
                    <div className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
                      <svg className="h-5 w-5 flex-none text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                      </svg>
                      <a href={`tel:${venue.phone}`} className="text-blue-600 hover:underline dark:text-blue-400">
                        {venue.phone}
                      </a>
                    </div>
                  )}
                  {venue.email && (
                    <div className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
                      <svg className="h-5 w-5 flex-none text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                        <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                      </svg>
                      <a href={`mailto:${venue.email}`} className="text-blue-600 hover:underline dark:text-blue-400">
                        {venue.email}
                      </a>
                    </div>
                  )}
                  {venue.website && (
                    <div className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
                      <svg className="h-5 w-5 flex-none text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M4.083 9h1.946c.089-1.546.383-2.97.837-4.118A6.004 6.004 0 004.083 9zM10 2a8 8 0 100 16 8 8 0 000-16zm0 2c-.076 0-.232.032-.465.262-.238.234-.497.623-.737 1.182-.389.907-.706 2.142-.766 3.556h3.936c-.06-1.414-.377-2.649-.766-3.556-.24-.56-.5-.948-.737-1.182C10.232 4.032 10.076 4 10 4zm3.971 5c-.089-1.546-.383-2.97-.837-4.118A6.004 6.004 0 0115.917 9h-1.946zm-2.003 2H8.032c.06 1.414.377 2.649.766 3.556.24.56.5.948.737 1.182.233.23.389.262.465.262.076 0 .232-.032.465-.262.238-.234.498-.623.737-1.182.389-.907.706-2.142.766-3.556zm1.166 4.118c.454-1.147.748-2.572.837-4.118h1.946a6.004 6.004 0 01-2.783 4.118zm-6.268 0C6.412 13.97 6.118 12.546 6.03 11H4.083a6.004 6.004 0 002.783 4.118z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <a
                        href={venue.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {venue.website.replace(/^https?:\/\//, "")}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}

            {venue.website && (
              <div className="mt-6 sm:mt-8">
                <a
                  href={venue.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-base font-semibold text-white shadow-lg transition hover:bg-indigo-700 sm:px-6 sm:py-4 sm:text-lg"
                >
                  <span>Перейти на сайт</span>
                  <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                    <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                  </svg>
                </a>
              </div>
            )}

            <div className="mt-6 text-center">
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {venue.partner.name} — партнёр профсоюза
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
