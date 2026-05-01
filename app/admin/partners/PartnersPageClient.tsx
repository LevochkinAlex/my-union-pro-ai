"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import ImpersonateButton from "@/components/admin/users/ImpersonateButton";
import { alertError, alertSuccess } from "@/lib/alert";
import {
  arePartnerRequisitesValid,
  isLooseEmailValid,
  isPartnerInnComplete,
  partnerRequisitesDigits,
  PARTNER_INN_MAX,
  PARTNER_KPP_MAX,
  PARTNER_OGRN_MAX,
} from "@/lib/partner-requisites";
import {
  getPartnerModerationStatusLabel,
  partnerModerationStatusBadgeClass,
} from "@/lib/partner-moderation-status";
import { adminTableActionOutlineClass } from "@/lib/admin-table-action-styles";
import { useTouchStickyRowSelection } from "@/lib/use-touch-sticky-row-selection";

const PAGE_SIZE = 20;

type PartnerForm = {
  name: string;
  description: string;
  website: string;
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
  isActive: boolean;
};

export type PartnerRow = {
  id: string;
  name: string;
  description: string | null;
  website: string | null;
  inn: string | null;
  ogrn: string | null;
  kpp: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  contactLastName: string | null;
  contactFirstName: string | null;
  contactMiddleName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactJobTitle: string | null;
  linkedUserId: string | null;
  linkedUser?: { id: string; email: string | null } | null;
  /** Учётка кабинета партнёра (User.partnerRecordId → Partner) */
  cabinetUser?: { id: string; email: string | null } | null;
  isActive: boolean;
  /** Статус модерации (PartnerModerationStatus) */
  moderationStatus?: string;
  createdAt: string;
};

const emptyForm = (): PartnerForm => ({
  name: "",
  description: "",
  website: "",
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
  isActive: true,
});

function formatContactFio(p: PartnerRow | null | undefined): string {
  if (!p || typeof p !== "object") return "—";
  const parts = [p.contactLastName, p.contactFirstName, p.contactMiddleName].filter(Boolean);
  return parts.length ? parts.join(" ") : "—";
}

type PartnersPageClientProps = {
  initialPartners?: PartnerRow[];
  initialTotal?: number;
  serverError?: string | null;
};

export default function PartnersPageClient({
  initialPartners = [],
  initialTotal = 0,
  serverError = null,
}: PartnersPageClientProps) {
  const safeInitial = Array.isArray(initialPartners) ? initialPartners.filter((p) => p && p.id) : [];
  const [partners, setPartners] = useState<PartnerRow[]>(safeInitial);
  const [total, setTotal] = useState(initialTotal);
  const [totalPages, setTotalPages] = useState(Math.max(1, Math.ceil(initialTotal / PAGE_SIZE)));
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(initialTotal === 0);
  const [loadError, setLoadError] = useState<string | null>(serverError);
  /** Дедупликация эффекта загрузки (React 18 Strict Mode вызывает useEffect дважды с тем же search). */
  const lastInitiatedListFetchKey = useRef<string | null>(null);
  /** Только первый маунт: можно пропустить клиентский fetch для пустого поиска, если SSR уже отдал данные. */
  const maySkipInitialClientFetchRef = useRef(true);

  const [isCreating, setIsCreating] = useState(false);
  /** Явный lazy-init, чтобы состояние всегда было объектом формы (не ссылкой на factory). */
  const [formData, setFormData] = useState<PartnerForm>(() => emptyForm());
  const [saving, setSaving] = useState(false);
  const touchRow = useTouchStickyRowSelection();

  /** Модалка «Создание»: как название — пока не заполнены обязательные поля, «Сохранить» неактивна */
  const createFormCanSave = useMemo(() => {
    if (!formData.name.trim()) return false;
    if (!isPartnerInnComplete(formData.inn) || !arePartnerRequisitesValid(formData.inn, formData.ogrn, formData.kpp)) {
      return false;
    }
    if (!isLooseEmailValid(formData.email)) return false;
    return true;
  }, [formData.name, formData.inn, formData.ogrn, formData.kpp, formData.email]);

  const loadPartners = useCallback(async (pageNum: number, searchQuery: string): Promise<boolean> => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(pageNum));
      params.set("limit", String(PAGE_SIZE));
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      const res = await fetch(`/api/admin/partners?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          data.error || (res.status === 403 ? "Недостаточно прав. Войдите как суперадмин." : "Ошибка загрузки");
        setLoadError(msg);
        setPartners([]);
        setTotal(0);
        setTotalPages(1);
        return false;
      }
      setLoadError(null);
      setPartners(data.partners || []);
      setTotal(data.total ?? 0);
      setTotalPages(Math.max(1, data.totalPages ?? 1));
      setPage(data.page ?? pageNum);
      return true;
    } catch {
      setLoadError("Ошибка сети");
      setPartners([]);
      setTotal(0);
      setTotalPages(1);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const fetchKey = `p1|${search}`;
    if (lastInitiatedListFetchKey.current === fetchKey) {
      return;
    }

    // Успешный SSR уже отдал первую страницу — не дублируем GET на первом маунте с пустым поиском,
    // иначе при ошибке второго запроса список затирается (мигание «данные → ошибка»).
    if (
      maySkipInitialClientFetchRef.current &&
      !serverError &&
      search === "" &&
      initialTotal > 0
    ) {
      maySkipInitialClientFetchRef.current = false;
      lastInitiatedListFetchKey.current = fetchKey;
      return;
    }
    maySkipInitialClientFetchRef.current = false;

    lastInitiatedListFetchKey.current = fetchKey;

    void loadPartners(1, search).then((ok) => {
      if (ok === false) {
        lastInitiatedListFetchKey.current = null;
      }
    });
  }, [search, loadPartners, initialTotal, serverError]);

  const goToPage = (p: number) => {
    const next = Math.max(1, Math.min(p, totalPages));
    loadPartners(next, search);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  };

  const handleCreate = () => {
    setIsCreating(true);
    setFormData(emptyForm());
  };

  const closeModal = () => {
    if (saving) return;
    setIsCreating(false);
  };

  const handleSave = async () => {
    if (!createFormCanSave) return;
    const name = formData.name.trim();
    if (!name) {
      alertError("Укажите название партнёра.", "Партнеры");
      return;
    }
    if (!isPartnerInnComplete(formData.inn) || !arePartnerRequisitesValid(formData.inn, formData.ogrn, formData.kpp)) {
      alertError(
        "Укажите ИНН: 10 или 12 цифр. ОГРН: 13 или 15 цифр (или пусто). КПП: 9 цифр (или пусто). Допускаются только цифры.",
        "Партнеры"
      );
      return;
    }
    const emailTrim = formData.email.trim();
    if (!isLooseEmailValid(formData.email)) {
      alertError("Укажите корректный email в поле «Email» (реквизиты юр. лица).", "Партнеры");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: formData.description.trim() || undefined,
          website: formData.website.trim() || undefined,
          inn: formData.inn.trim(),
          ogrn: formData.ogrn.trim() || undefined,
          kpp: formData.kpp.trim() || undefined,
          address: formData.address.trim() || undefined,
          phone: formData.phone.trim() || undefined,
          email: emailTrim.toLowerCase(),
          contactLastName: formData.contactLastName.trim() || undefined,
          contactFirstName: formData.contactFirstName.trim() || undefined,
          contactMiddleName: formData.contactMiddleName.trim() || undefined,
          contactEmail: formData.contactEmail.trim() || undefined,
          contactPhone: formData.contactPhone.trim() || undefined,
          contactJobTitle: formData.contactJobTitle.trim() || undefined,
          isActive: formData.isActive,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alertError(typeof data.error === "string" ? data.error : "Ошибка сохранения", "Партнеры");
        return;
      }
      alertSuccess("Партнёр сохранён.", "Партнеры");
      setIsCreating(false);
      setPage(1);
      await loadPartners(1, search);
    } catch {
      alertError("Ошибка сети", "Партнеры");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 min-w-0 w-full">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Партнеры</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Управление партнёрскими программами и связями.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-blue-700"
        >
          Добавить партнера
        </button>
      </div>

      <form onSubmit={handleSearchSubmit}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 w-full max-w-full sm:min-w-[200px] sm:flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Поиск по названию, ИНН, email, телефону, контакту..."
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-gray-200 px-4 py-2 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"
          >
            Найти
          </button>
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                setSearch("");
              }}
              className="rounded-lg px-4 py-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
            >
              Сбросить
            </button>
          )}
        </div>
      </form>

      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {loadError}
        </div>
      )}

      <div
        ref={touchRow.containerRef}
        className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
      >
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        ) : (
          <table className="w-full min-w-[1024px]">
            <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
              <tr>
                <th className="min-w-0 px-6 py-3 text-center text-sm font-semibold text-gray-900 dark:text-white">
                  Название
                </th>
                <th className="w-[1%] whitespace-nowrap px-6 py-3 text-center text-sm font-semibold text-gray-900 dark:text-white">
                  ИНН
                </th>
                <th className="w-[1%] whitespace-nowrap px-6 py-3 text-center text-sm font-semibold text-gray-900 dark:text-white">
                  Email
                </th>
                <th className="w-[1%] whitespace-nowrap px-6 py-3 text-center text-sm font-semibold text-gray-900 dark:text-white">
                  Телефон
                </th>
                <th className="w-[1%] whitespace-nowrap px-6 py-3 text-center text-sm font-semibold text-gray-900 dark:text-white">
                  Контактное лицо
                </th>
                <th className="w-[1%] whitespace-nowrap px-6 py-3 text-center text-sm font-semibold text-gray-900 dark:text-white">
                  Статус
                </th>
                <th className="w-[1%] whitespace-nowrap px-6 py-3 text-center text-sm font-semibold text-gray-900 dark:text-white">
                  Дата создания
                </th>
                <th className="w-[1%] whitespace-nowrap px-6 py-3 text-center text-sm font-semibold text-gray-900 dark:text-white">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {partners.filter((p) => p?.id).map((p) => {
                const impersonateId =
                  p.cabinetUser?.id ?? p.linkedUser?.id ?? p.linkedUserId ?? null;
                const impersonateEmail =
                  p.cabinetUser?.email?.trim() ||
                  p.linkedUser?.email?.trim() ||
                  p.email?.trim() ||
                  p.contactEmail?.trim() ||
                  "";
                return (
                  <tr
                    key={p.id}
                    className={touchRow.getRowClassName(p.id)}
                    onClick={(e) => touchRow.handleRowClick(e, p.id)}
                  >
                    <td className="min-w-0 px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-white">
                      <span className="inline-block max-w-full break-words">{p.name ?? "—"}</span>
                    </td>
                    <td className="w-[1%] whitespace-nowrap px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400">
                      {p.inn ?? "—"}
                    </td>
                    <td className="w-[1%] whitespace-nowrap px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400">
                      {p.email ?? "—"}
                    </td>
                    <td className="w-[1%] whitespace-nowrap px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400">
                      {p.phone ?? "—"}
                    </td>
                    <td className="w-[1%] whitespace-nowrap px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400">
                      {formatContactFio(p)}
                    </td>
                    <td className="w-[1%] whitespace-nowrap px-6 py-4 text-center text-sm align-middle">
                      <span
                        className={`inline-flex w-max max-w-none whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${partnerModerationStatusBadgeClass(
                          p.moderationStatus ?? "DRAFT"
                        )}`}
                        title={getPartnerModerationStatusLabel(p.moderationStatus ?? "DRAFT")}
                      >
                        {getPartnerModerationStatusLabel(p.moderationStatus ?? "DRAFT")}
                      </span>
                    </td>
                    <td className="w-[1%] whitespace-nowrap px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400">
                      {p.createdAt ? new Date(p.createdAt).toLocaleDateString("ru-RU") : "—"}
                    </td>
                    <td className="w-[1%] px-6 py-4 text-center text-sm align-middle">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Link
                          href={`/admin/partners/${p.id}`}
                          className={adminTableActionOutlineClass}
                        >
                          Редактировать
                        </Link>
                        {impersonateId ? (
                          <ImpersonateButton
                            userId={impersonateId}
                            userEmail={impersonateEmail || undefined}
                            disabled={(p.moderationStatus ?? "") === "BLOCKED"}
                          />
                        ) : (
                          <span className="whitespace-nowrap text-xs text-gray-400 dark:text-gray-500">
                            Нет учётной записи
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {!loading && partners.length === 0 && !loadError && (
          <div className="py-12 text-center text-gray-600 dark:text-gray-400">Партнёров не найдено</div>
        )}
      </div>

      {!loading && totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Показано {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} из {total}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover-surface"
            >
              <ChevronLeft className="h-4 w-4" />
              Назад
            </button>
            <span className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
              Страница {page} из {totalPages}
            </span>
            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover-surface"
            >
              Вперёд
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {isCreating && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div
            className="flex min-h-full items-center justify-center bg-black/50 p-4 transition-opacity"
            onClick={closeModal}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="partner-modal-title"
              className="relative w-full max-w-3xl rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                <h2
                  id="partner-modal-title"
                  className="text-xl font-semibold text-gray-900 dark:text-white"
                >
                  Создание партнёра
                </h2>
                <button
                  type="button"
                  aria-label="Закрыть окно"
                  title="Закрыть"
                  onClick={closeModal}
                  disabled={saving}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="max-h-[calc(100vh-200px)] overflow-y-auto px-6 py-4">
                <div className="space-y-4">
                  <div>
                    <label htmlFor="partner-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Название партнёра *
                    </label>
                    <input
                      id="partner-name"
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                      placeholder="Например: ООО «Партнёр»"
                      disabled={saving}
                    />
                  </div>

                  <div>
                    <label htmlFor="partner-desc" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Описание
                    </label>
                    <textarea
                      id="partner-desc"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                      rows={3}
                      placeholder="Кратко о партнёрской программе"
                      disabled={saving}
                    />
                  </div>

                  <div>
                    <label htmlFor="partner-website" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Сайт
                    </label>
                    <input
                      id="partner-website"
                      type="url"
                      value={formData.website}
                      onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                      placeholder="https://"
                      disabled={saving}
                    />
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-800/50">
                    <h3 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">
                      Реквизиты юр. лица (фирмы/партнера)
                    </h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <label htmlFor="partner-inn" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          ИНН *
                        </label>
                        <input
                          id="partner-inn"
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
                          required
                          aria-required
                        />
                      </div>
                      <div>
                        <label htmlFor="partner-ogrn" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          ОГРН
                        </label>
                        <input
                          id="partner-ogrn"
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
                        <label htmlFor="partner-kpp" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          КПП
                        </label>
                        <input
                          id="partner-kpp"
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
                        <label htmlFor="partner-phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Телефон
                        </label>
                        <input
                          id="partner-phone"
                          type="text"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                          disabled={saving}
                        />
                      </div>
                    </div>
                    <div className="mt-4">
                      <label htmlFor="partner-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Email *
                      </label>
                      <input
                        id="partner-email"
                        type="email"
                        autoComplete="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className={`mt-1 block w-full rounded-md border px-3 py-2 dark:border-gray-600 dark:bg-gray-700 ${
                          formData.email.trim().length > 0 && !isLooseEmailValid(formData.email)
                            ? "border-amber-500 ring-1 ring-amber-500/30 dark:border-amber-600"
                            : "border-gray-300"
                        }`}
                        placeholder="name@company.ru"
                        disabled={saving}
                        required
                        aria-required
                      />
                    </div>
                    <div className="mt-4">
                      <label htmlFor="partner-address" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Адрес
                      </label>
                      <textarea
                        id="partner-address"
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
                        <label htmlFor="partner-contact-last" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Фамилия
                        </label>
                        <input
                          id="partner-contact-last"
                          type="text"
                          value={formData.contactLastName}
                          onChange={(e) => setFormData({ ...formData, contactLastName: e.target.value })}
                          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                          placeholder="Иванов"
                          autoComplete="off"
                          disabled={saving}
                        />
                      </div>
                      <div>
                        <label htmlFor="partner-contact-first" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Имя
                        </label>
                        <input
                          id="partner-contact-first"
                          type="text"
                          value={formData.contactFirstName}
                          onChange={(e) => setFormData({ ...formData, contactFirstName: e.target.value })}
                          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                          placeholder="Иван"
                          autoComplete="off"
                          disabled={saving}
                        />
                      </div>
                      <div>
                        <label htmlFor="partner-contact-middle" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Отчество
                        </label>
                        <input
                          id="partner-contact-middle"
                          type="text"
                          value={formData.contactMiddleName}
                          onChange={(e) => setFormData({ ...formData, contactMiddleName: e.target.value })}
                          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                          placeholder="Иванович"
                          autoComplete="off"
                          disabled={saving}
                        />
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <label htmlFor="partner-contact-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Email
                        </label>
                        <input
                          id="partner-contact-email"
                          type="email"
                          value={formData.contactEmail}
                          onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                          placeholder="contact@example.com"
                          autoComplete="off"
                          disabled={saving}
                        />
                      </div>
                      <div>
                        <label htmlFor="partner-contact-phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Телефон
                        </label>
                        <input
                          id="partner-contact-phone"
                          type="tel"
                          value={formData.contactPhone}
                          onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                          placeholder="+7 (999) 123-45-67"
                          autoComplete="off"
                          disabled={saving}
                        />
                      </div>
                    </div>

                    <div className="mt-4">
                      <label htmlFor="partner-contact-job" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Должность
                      </label>
                      <input
                        id="partner-contact-job"
                        type="text"
                        value={formData.contactJobTitle}
                        onChange={(e) => setFormData({ ...formData, contactJobTitle: e.target.value })}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                        placeholder="Например: менеджер по партнёрству"
                        autoComplete="off"
                        disabled={saving}
                      />
                    </div>
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
              </div>

              <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover-surface"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!createFormCanSave || saving}
                  className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Сохранение…" : "Сохранить"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
