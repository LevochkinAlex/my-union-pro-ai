"use client";

import React, { useState, useEffect } from "react";
import { alertSuccess, alertError, confirm } from "@/lib/alert";

// ИСПРАВЛЕНО: Убран импорт типа из @prisma/client, используем строковый литерал
type OrganizationType = "PRIMARY" | "REGIONAL" | "FEDERAL";

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

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [jobTitles, setJobTitles] = useState<string[]>([]);
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
  });

  useEffect(() => {
    loadOrganizations();
    loadJobTitles();
  }, []);

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
    });
  };

  const handleEdit = (org: Organization) => {
    setSelectedOrg(org);
    setIsEditing(true);
    setIsCreating(false);
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
              }),
            });

            if (!inviteResponse.ok) {
              const inviteError = await inviteResponse.json();
              console.error("Ошибка отправки инвайта:", inviteError);
              alertError(`Организация сохранена, но не удалось отправить инвайт: ${inviteError.error || "Неизвестная ошибка"}`);
            } else {
              alertSuccess("Организация успешно сохранена! Инвайт-ссылка отправлена председателю на email.");
            }
          } catch (inviteError) {
            console.error("Ошибка отправки инвайта:", inviteError);
            alertError("Организация сохранена, но произошла ошибка при отправке инвайта.");
          }
        } else {
          alertSuccess("Организация успешно сохранена!");
        }

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
                {node.type === "FEDERAL" ? "Федерация" : node.type === "REGIONAL" ? "Региональное" : "ППО"}
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

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
          <p className="text-gray-600 dark:text-gray-400">Загрузка организаций...</p>
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

      {(isEditing || isCreating) && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold">
            {isCreating ? "Создание организации" : "Редактирование организации"}
          </h2>

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
                  <input
                    type="email"
                    value={formData.chairmanEmail}
                    onChange={(e) => setFormData({ ...formData, chairmanEmail: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                    placeholder="chairman@example.com"
                  />
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
                  />
                </div>
              </div>

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

            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                Сохранить
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setIsCreating(false);
                  setSelectedOrg(null);
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
              >
                Отмена
              </button>
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

