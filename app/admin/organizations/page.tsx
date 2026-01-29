"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { alertSuccess, alertError, confirm } from "@/lib/alert";

// ИСПРАВЛЕНО: Убран импорт типа из @prisma/client, используем строковый литерал
type OrganizationType = "PRIMARY" | "LOCAL" | "REGIONAL" | "FEDERAL";

interface Organization {
  id: string;
  name: string;
  type: OrganizationType;
  parentId: string | null;
  level: number;
  sortOrder: number;
  fullPath: string | null;
  inn: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  chairmanName: string | null;
  chairmanJobTitle: string | null;
  isActive: boolean;
  parent?: {
    id: string;
    name: string;
    type: OrganizationType;
  } | null;
  children?: Organization[];
  _count?: {
    members: number;
  };
}

interface JobTitle {
  name: string;
}

interface ExistingUser {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  jobTitle: string | null;
  role: string;
  membershipStatus: string;
  isPPOHead: boolean;
  currentPPOOrganization: { id: string; name: string } | null;
  memberOrganization: { id: string; name: string } | null;
}

export default function OrganizationsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  
  // Состояние для найденного существующего пользователя
  const [existingUser, setExistingUser] = useState<ExistingUser | null>(null);
  const [searchingUser, setSearchingUser] = useState(false);
  const [userConfirmed, setUserConfirmed] = useState(false);
  
  const [formData, setFormData] = useState<{
    name: string;
    type: OrganizationType;
    parentId: string;
    inn: string;
    address: string;
    phone: string;
    email: string;
    chairmanName: string;
    chairmanJobTitle: string;
    chairmanEmail: string;
    chairmanPhone: string;
    chairmanFirstName: string;
    chairmanLastName: string;
    chairmanMiddleName: string;
    isActive: boolean;
    existingUserId: string;
  }>({
    name: "",
    type: "FEDERAL",
    parentId: "",
    inn: "",
    address: "",
    phone: "",
    email: "",
    chairmanName: "",
    chairmanJobTitle: "",
    chairmanEmail: "",
    chairmanPhone: "",
    chairmanFirstName: "",
    chairmanLastName: "",
    chairmanMiddleName: "",
    isActive: true,
    existingUserId: "",
  });

  useEffect(() => {
    loadOrganizations();
    loadJobTitles();
  }, []);

  // Функция поиска существующего пользователя по email или телефону
  const searchExistingUser = async (email?: string, phone?: string) => {
    if (!email && !phone) {
      setExistingUser(null);
      return;
    }

    try {
      setSearchingUser(true);
      const params = new URLSearchParams();
      if (email) params.append("email", email);
      if (phone) params.append("phone", phone);
      
      const response = await fetch(`/api/admin/users/search?${params}`);
      if (response.ok) {
        const data = await response.json();
        if (data.found && data.user) {
          setExistingUser(data.user);
          // Если пользователь найден и ещё не подтверждён, НЕ заполняем данные автоматически
          // Пользователь должен сначала подтвердить
        } else {
          setExistingUser(null);
          setUserConfirmed(false);
        }
      }
    } catch (error) {
      console.error("Ошибка поиска пользователя:", error);
    } finally {
      setSearchingUser(false);
    }
  };

  // Debounce поиска при вводе email или телефона
  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.chairmanEmail || formData.chairmanPhone) {
        searchExistingUser(formData.chairmanEmail, formData.chairmanPhone);
      } else {
        setExistingUser(null);
        setUserConfirmed(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [formData.chairmanEmail, formData.chairmanPhone]);

  // Функция подтверждения использования существующего пользователя
  const confirmExistingUser = () => {
    if (!existingUser) return;
    
    // Заполняем данные из существующего пользователя
    setFormData(prev => ({
      ...prev,
      chairmanFirstName: existingUser.firstName || "",
      chairmanLastName: existingUser.lastName || "",
      chairmanMiddleName: existingUser.middleName || "",
      chairmanEmail: existingUser.email || prev.chairmanEmail,
      chairmanPhone: existingUser.phone || prev.chairmanPhone,
      // Подтягиваем должность только если она не была заполнена вручную
      chairmanJobTitle: prev.chairmanJobTitle || existingUser.jobTitle || "",
      existingUserId: existingUser.id,
    }));
    setUserConfirmed(true);
  };

  // Функция сброса привязки к существующему пользователю
  const resetExistingUser = () => {
    setExistingUser(null);
    setUserConfirmed(false);
    setFormData(prev => ({
      ...prev,
      existingUserId: "",
    }));
  };

  const loadOrganizations = async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      console.log("[organizations] Loading organizations...");
      const response = await fetch("/api/admin/organizations?includeInactive=true");
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("[organizations] API error:", response.status, errorData);
        const errorMsg = errorData.error || `HTTP ${response.status}: ${response.statusText}`;
        setLoadError(errorMsg);
        alertError(`Ошибка загрузки: ${errorMsg}`);
        setOrganizations([]);
        return;
      }
      
      const data = await response.json();
      console.log("[organizations] Loaded:", data.organizations?.length || 0, "organizations");
      setOrganizations(data.organizations || []);
    } catch (error) {
      console.error("[organizations] Error loading organizations:", error);
      const errorMsg = error instanceof Error ? error.message : "Ошибка сети при загрузке организаций";
      setLoadError(errorMsg);
      alertError(errorMsg);
      setOrganizations([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadJobTitles = async () => {
    try {
      const response = await fetch("/api/dictionaries");
      if (response.ok) {
        const data = await response.json();
        setJobTitles(data.jobTitles || []);
      }
    } catch (error) {
      console.error("Ошибка загрузки должностей:", error);
    }
  };

  const handleCreate = () => {
    setIsCreating(true);
    setIsEditing(false);
    setSelectedOrg(null);
    setExistingUser(null);
    setUserConfirmed(false);
    setFormData({
      name: "",
      type: "FEDERAL",
      parentId: "",
      inn: "",
      address: "",
      phone: "",
      email: "",
      chairmanName: "",
      chairmanJobTitle: "",
      chairmanEmail: "",
      chairmanPhone: "",
      chairmanFirstName: "",
      chairmanLastName: "",
      chairmanMiddleName: "",
      isActive: true,
      existingUserId: "",
    });
  };

  const handleEdit = (org: Organization) => {
    setSelectedOrg(org);
    setIsEditing(true);
    setIsCreating(false);
    setExistingUser(null);
    setUserConfirmed(false);
    // Парсим ФИО председателя из chairmanName
    const nameParts = (org.chairmanName || "").split(" ");
    setFormData({
      name: org.name,
      type: org.type,
      parentId: org.parentId || "",
      inn: org.inn || "",
      address: org.address || "",
      phone: org.phone || "",
      email: org.email || "",
      chairmanName: org.chairmanName || "",
      chairmanJobTitle: org.chairmanJobTitle || "",
      chairmanEmail: "",
      chairmanPhone: "",
      chairmanFirstName: nameParts[1] || "",
      chairmanLastName: nameParts[0] || "",
      chairmanMiddleName: nameParts[2] || "",
      isActive: org.isActive,
      existingUserId: "",
    });
  };

  const handleSave = async () => {
    try {
      // Валидация данных председателя
      if (formData.chairmanEmail || formData.chairmanPhone || formData.chairmanFirstName || formData.chairmanLastName) {
        if (!formData.chairmanEmail || !formData.chairmanPhone || !formData.chairmanFirstName || !formData.chairmanLastName) {
          alertError("Для назначения председателя необходимо заполнить все обязательные поля: Фамилия, Имя, Email, Телефон");
          return;
        }
      }

      const url = isCreating
        ? "/api/admin/organizations"
        : `/api/admin/organizations/${selectedOrg?.id}`;
      
      const method = isCreating ? "POST" : "PUT";
      
      // Формируем полное ФИО председателя
      const chairmanFullName = [
        formData.chairmanLastName,
        formData.chairmanFirstName,
        formData.chairmanMiddleName
      ].filter(Boolean).join(" ");

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          chairmanName: chairmanFullName || formData.chairmanName,
          parentId: formData.parentId || null,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        
        // Если указаны данные председателя, отправляем инвайт
        if (formData.chairmanEmail && formData.chairmanPhone && formData.chairmanFirstName && formData.chairmanLastName) {
          try {
            const inviteResponse = await fetch(`/api/admin/organizations/${result.organization.id}/invite-chairman`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email: formData.chairmanEmail,
                phone: formData.chairmanPhone,
                firstName: formData.chairmanFirstName,
                lastName: formData.chairmanLastName,
                middleName: formData.chairmanMiddleName,
                jobTitle: formData.chairmanJobTitle,
                existingUserId: formData.existingUserId || undefined, // Передаём ID существующего пользователя
              }),
            });

            if (!inviteResponse.ok) {
              const inviteError = await inviteResponse.json();
              console.error("Ошибка отправки инвайта:", inviteError);
              alertError(`Организация сохранена, но не удалось отправить инвайт: ${inviteError.error || "Неизвестная ошибка"}`);
            } else {
              const inviteResult = await inviteResponse.json();
              if (inviteResult.existingUserPromoted) {
                alertSuccess("Организация успешно сохранена! Существующему пользователю предоставлены права председателя ППО. Уведомление отправлено на email.");
              } else {
                alertSuccess("Организация успешно сохранена! Инвайт-ссылка отправлена председателю на email.");
              }
            }
          } catch (inviteError) {
            console.error("Ошибка отправки инвайта:", inviteError);
            alertError("Организация сохранена, но произошла ошибка при отправке инвайта.");
          }
        } else {
          alertSuccess("Организация успешно сохранена!");
        }
        
        // Сбрасываем состояние существующего пользователя
        setExistingUser(null);
        setUserConfirmed(false);

        await loadOrganizations();
        setIsEditing(false);
        setIsCreating(false);
        setSelectedOrg(null);
      } else {
        const error = await response.json();
        const errorMessage = error.details 
          ? `${error.error}\n\nДетали: ${JSON.stringify(error.details, null, 2)}`
          : error.error;
        console.error("Ошибка сохранения организации:", error);
        alertError(errorMessage);
      }
    } catch (error) {
      console.error("Ошибка сохранения:", error);
      alertError("Ошибка при сохранении организации");
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirm("Вы уверены, что хотите удалить эту организацию?", "Подтвердите удаление");
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/admin/organizations/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        await loadOrganizations();
        if (selectedOrg?.id === id) {
          setSelectedOrg(null);
          setIsEditing(false);
        }
        alertSuccess("Организация удалена!");
      } else {
        const error = await response.json();
        alertError(error.error || "Ошибка при удалении организации");
      }
    } catch (error) {
      console.error("Ошибка удаления:", error);
      alertError("Ошибка при удалении организации");
    }
  };

  // Построение дерева организаций
  const buildTree = (orgs: Organization[]): Organization[] => {
    const orgMap = new Map<string, Organization>();
    const rootOrgs: Organization[] = [];

    // Создаем карту всех организаций
    orgs.forEach((org) => {
      orgMap.set(org.id, { ...org, children: [] });
    });

    // Строим дерево
    orgs.forEach((org) => {
      const orgWithChildren = orgMap.get(org.id)!;
      if (org.parentId && orgMap.has(org.parentId)) {
        const parent = orgMap.get(org.parentId)!;
        if (!parent.children) {
          parent.children = [];
        }
        parent.children.push(orgWithChildren);
      } else {
        rootOrgs.push(orgWithChildren);
      }
    });

    // Сортируем по sortOrder
    const sortTree = (nodes: Organization[]): Organization[] => {
      return nodes
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((node) => ({
          ...node,
          children: node.children ? sortTree(node.children) : [],
        }));
    };

    return sortTree(rootOrgs);
  };

  const renderTree = (nodes: Organization[], level: number = 0): React.ReactElement[] => {
    return nodes.map((node) => (
      <div key={node.id} className="ml-4">
        <div
          className={`flex items-center gap-2 rounded-lg border p-3 ${
            level === 0
              ? "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20"
              : level === 1
              ? "border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/20"
              : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
          }`}
        >
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{node.name}</span>
              <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                {node.type === "FEDERAL" ? "Федерация" : node.type === "REGIONAL" ? "Региональное" : node.type === "LOCAL" ? "Местные" : "ППО"}
              </span>
              {!node.isActive && (
                <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-900 dark:text-red-300">
                  Неактивна
                </span>
              )}
            </div>
            {node.chairmanName && (
              <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Председатель: {node.chairmanName}
                {node.chairmanJobTitle && ` (${node.chairmanJobTitle})`}
              </div>
            )}
            {node._count && node._count.members > 0 && (
              <div className="mt-1 text-xs text-gray-500">
                Членов: {node._count.members}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleEdit(node)}
              className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
            >
              Редактировать
            </button>
            <button
              onClick={() => handleDelete(node.id)}
              className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700"
            >
              Удалить
            </button>
          </div>
        </div>
        {node.children && node.children.length > 0 && (
          <div className="mt-2 border-l-2 border-gray-300 dark:border-gray-600 pl-4">
            {renderTree(node.children, level + 1)}
          </div>
        )}
      </div>
    ));
  };

  // Показываем состояние загрузки сессии
  if (sessionStatus === "loading") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
          <p className="text-gray-600 dark:text-gray-400">Проверка авторизации...</p>
        </div>
      </div>
    );
  }

  // Проверяем авторизацию
  if (sessionStatus === "unauthenticated" || !session?.user) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center max-w-md">
          <div className="mb-4 inline-flex items-center justify-center h-12 w-12 rounded-full bg-yellow-100 dark:bg-yellow-900/30">
            <svg className="h-6 w-6 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Требуется авторизация
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Для доступа к этой странице необходимо войти в систему как администратор.
          </p>
          <a
            href="/login"
            className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Войти в систему
          </a>
        </div>
      </div>
    );
  }

  // Проверяем роль
  if (session.user.role !== "SUPER_ADMIN") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center max-w-md">
          <div className="mb-4 inline-flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30">
            <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Доступ запрещен
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-2">
            У вас нет прав для доступа к этой странице.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">
            Текущая роль: {session.user.role || "не определена"}
          </p>
          <a
            href="/dashboard"
            className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Вернуться в личный кабинет
          </a>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
          <p className="text-gray-600 dark:text-gray-400">Загрузка организаций...</p>
          <p className="mt-2 text-xs text-gray-500">
            Сессия: {session.user.id ? "активна" : "не активна"}
          </p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center max-w-md">
          <div className="mb-4 inline-flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30">
            <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Ошибка загрузки
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{loadError}</p>
          <button
            onClick={() => loadOrganizations()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Повторить попытку
          </button>
        </div>
      </div>
    );
  }

  const tree = buildTree(organizations);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Управление организациями
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Иерархия организаций профсоюза с указанием председателей
          </p>
        </div>
        <button
          onClick={handleCreate}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          + Создать организацию
        </button>
      </div>

      {/* Модальное окно редактирования/создания организации */}
      {(isEditing || isCreating) && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/50 transition-opacity"
            onClick={() => {
              setIsEditing(false);
              setIsCreating(false);
              setSelectedOrg(null);
              setExistingUser(null);
              setUserConfirmed(false);
            }}
          />
          
          {/* Modal */}
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative w-full max-w-3xl rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {isCreating ? "Создание организации" : "Редактирование организации"}
                </h2>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setIsCreating(false);
                    setSelectedOrg(null);
                    setExistingUser(null);
                    setUserConfirmed(false);
                  }}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Body */}
              <div className="max-h-[calc(100vh-200px)] overflow-y-auto px-6 py-4">
                <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Название организации *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                placeholder="Например: МООП РЗ РФ"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Тип организации *
              </label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as OrganizationType })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
              >
                <option value="FEDERAL">Федерация</option>
                <option value="REGIONAL">Региональное отделение</option>
                <option value="LOCAL">Местные организации</option>
                <option value="PRIMARY">ППО (Первичная профсоюзная организация)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Родительская организация
              </label>
              <select
                value={formData.parentId}
                onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
              >
                <option value="">Нет (корневая организация)</option>
                {organizations
                  .filter((org) => org.id !== selectedOrg?.id)
                  .map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.fullPath || org.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  ИНН
                </label>
                <input
                  type="text"
                  value={formData.inn}
                  onChange={(e) => setFormData({ ...formData, inn: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Телефон
                </label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Адрес
              </label>
              <textarea
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                rows={2}
              />
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
              <h3 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
                Председатель организации
              </h3>
              
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Фамилия *
                  </label>
                  <input
                    type="text"
                    value={formData.chairmanLastName}
                    onChange={(e) => setFormData({ ...formData, chairmanLastName: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                    placeholder="Иванов"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Имя *
                  </label>
                  <input
                    type="text"
                    value={formData.chairmanFirstName}
                    onChange={(e) => setFormData({ ...formData, chairmanFirstName: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                    placeholder="Иван"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Отчество
                  </label>
                  <input
                    type="text"
                    value={formData.chairmanMiddleName}
                    onChange={(e) => setFormData({ ...formData, chairmanMiddleName: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                    placeholder="Иванович"
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Email председателя *
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      value={formData.chairmanEmail}
                      onChange={(e) => setFormData({ ...formData, chairmanEmail: e.target.value })}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                      placeholder="chairman@example.com"
                      disabled={userConfirmed}
                    />
                    {searchingUser && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
                      </div>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    На этот email будет отправлена инвайт-ссылка для авторизации
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Телефон председателя *
                  </label>
                  <input
                    type="tel"
                    value={formData.chairmanPhone}
                    onChange={(e) => setFormData({ ...formData, chairmanPhone: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                    placeholder="+7 (999) 123-45-67"
                    disabled={userConfirmed}
                  />
                </div>
              </div>

              {/* Предупреждение о существующем пользователе */}
              {existingUser && !userConfirmed && (
                <div className="mt-4 rounded-lg border border-yellow-300 bg-yellow-50 p-4 dark:border-yellow-700 dark:bg-yellow-900/20">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200">
                        Найден существующий пользователь!
                      </h4>
                      <div className="mt-2 flex items-center gap-3">
                        {existingUser.avatarUrl && (
                          <img 
                            src={existingUser.avatarUrl} 
                            alt="" 
                            className="h-10 w-10 rounded-full object-cover"
                          />
                        )}
                        <div>
                          <p className="text-sm text-yellow-700 dark:text-yellow-300">
                            <strong>{existingUser.fullName || "Без имени"}</strong>
                          </p>
                          <p className="text-xs text-yellow-600 dark:text-yellow-400">
                            {existingUser.email && <span className="mr-2">{existingUser.email}</span>}
                            {existingUser.phone && <span>{existingUser.phone}</span>}
                          </p>
                          <p className="text-xs text-yellow-600 dark:text-yellow-400">
                            Роль: {existingUser.role === "MEMBER" ? "Член профсоюза" : existingUser.role}
                            {existingUser.isPPOHead && existingUser.currentPPOOrganization && (
                              <span className="ml-1">
                                (уже председатель: {existingUser.currentPPOOrganization.name})
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-yellow-600 dark:text-yellow-400">
                        Если вы подтвердите, этому пользователю будут предоставлены права председателя ППО. 
                        Он сможет переключаться между режимами «Член профсоюза» и «Председатель ППО».
                      </p>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={confirmExistingUser}
                          className="rounded bg-yellow-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-yellow-700"
                        >
                          Подтвердить и использовать данные
                        </button>
                        <button
                          type="button"
                          onClick={resetExistingUser}
                          className="rounded border border-yellow-600 px-3 py-1.5 text-xs font-medium text-yellow-600 hover:bg-yellow-100 dark:text-yellow-400 dark:hover:bg-yellow-900/30"
                        >
                          Создать нового пользователя
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Показываем инфо что пользователь подтверждён */}
              {userConfirmed && existingUser && (
                <div className="mt-4 rounded-lg border border-green-300 bg-green-50 p-4 dark:border-green-700 dark:bg-green-900/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <svg className="h-5 w-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <p className="text-sm font-medium text-green-800 dark:text-green-200">
                          Используется существующий пользователь: {existingUser.fullName}
                        </p>
                        <p className="text-xs text-green-600 dark:text-green-400">
                          Ему будут предоставлены права председателя ППО
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={resetExistingUser}
                      className="text-sm text-green-600 hover:text-green-700 dark:text-green-400"
                    >
                      Отменить
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Должность председателя
                </label>
                <input
                  type="text"
                  list="jobTitles"
                  value={formData.chairmanJobTitle}
                  onChange={(e) => setFormData({ ...formData, chairmanJobTitle: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                  placeholder="Выберите или введите должность"
                />
                <datalist id="jobTitles">
                  {jobTitles.map((title) => (
                    <option key={title} value={title} />
                  ))}
                </datalist>
              </div>
            </div>

            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Активна</span>
              </label>
            </div>

                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setIsCreating(false);
                    setSelectedOrg(null);
                    setExistingUser(null);
                    setUserConfirmed(false);
                  }}
                  className="rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Отмена
                </button>
                <button
                  onClick={handleSave}
                  className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
                >
                  Сохранить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Иерархия организаций
        </h2>
        {tree.length > 0 ? (
          <div className="space-y-2">{renderTree(tree)}</div>
        ) : (
          <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
            <p className="text-gray-600 dark:text-gray-400">
              Организаций пока нет. Создайте первую организацию.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

