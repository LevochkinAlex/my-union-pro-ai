"use client";

import React, { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { alertSuccess, alertError, confirm } from "@/lib/alert";
import OrgSubscriptionManage from "@/components/admin/OrgSubscriptionManage";

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
  isMPOHead: boolean;
  isRPOHead: boolean;
  isHead: boolean;
  currentPPOOrganization: { id: string; name: string } | null;
  currentMPOOrganization: { id: string; name: string } | null;
  currentRPOOrganization: { id: string; name: string } | null;
  currentHeadOrganization: { id: string; name: string } | null;
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

  // Фильтры списка организаций
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<OrganizationType | "ALL">("ALL");
  const [letterFilter, setLetterFilter] = useState<string | null>(null);
  
  // Состояние для найденного существующего пользователя
  const [existingUser, setExistingUser] = useState<ExistingUser | null>(null);
  const [searchingUser, setSearchingUser] = useState(false);
  const [userConfirmed, setUserConfirmed] = useState(false);

  // Привязанные места работы (юр. лица) — для ППО, региональных и местных организаций
  const [workplaceMappings, setWorkplaceMappings] = useState<Array<{ id: string; workplaceName: string; workplaceInn: string }>>([]);
  const [newWorkplaceInn, setNewWorkplaceInn] = useState("");
  const [newWorkplaceName, setNewWorkplaceName] = useState("");
  const [addingMapping, setAddingMapping] = useState(false);
  const [deletingMappingId, setDeletingMappingId] = useState<string | null>(null);
  // Поиск через DaData для заполнения привязок «место работы»
  const [dadataSearch, setDadataSearch] = useState("");
  const [dadataSuggestions, setDadataSuggestions] = useState<Array<{ inn: string; name: string }>>([]);
  const [dadataLoading, setDadataLoading] = useState(false);
  const [dadataOpen, setDadataOpen] = useState(false);
  const dadataWrapperRef = useRef<HTMLDivElement>(null);
  
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
          setUserConfirmed(false);
          setFormData((prev) => ({
            ...prev,
            existingUserId: "",
          }));
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

  // При открытии редактирования организации подгружаем председателя (email, телефон) из пользователя с ppoHeadOrganizationId
  useEffect(() => {
    if (!isEditing || !selectedOrg?.id) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/organizations/${selectedOrg.id}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        const cu = data.chairmanUser;
        if (cu) {
          setFormData((prev) => ({
            ...prev,
            chairmanEmail: cu.email ?? prev.chairmanEmail,
            chairmanPhone: cu.phone ?? prev.chairmanPhone,
            chairmanFirstName: cu.firstName ?? prev.chairmanFirstName,
            chairmanLastName: cu.lastName ?? prev.chairmanLastName,
            chairmanMiddleName: cu.middleName ?? prev.chairmanMiddleName,
            chairmanJobTitle: cu.jobTitle ?? prev.chairmanJobTitle,
            existingUserId: cu.id ?? prev.existingUserId,
          }));
          // Не ставим userConfirmed при загрузке — поля остаются редактируемыми; userConfirmed только при явном «Подтвердить» в блоке существующего пользователя
        }
      } catch (e) {
        if (!cancelled) console.error("[admin/organizations] Load chairman:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEditing, selectedOrg?.id]);

  // Функция подтверждения использования существующего пользователя
  const confirmExistingUser = () => {
    if (!existingUser) return;
    if (isExistingUserHeadInAnotherOrg) {
      alertError(
        `Пользователь уже назначен председателем в организации «${existingUser.currentHeadOrganization?.name}». Для этой организации создайте нового пользователя или снимите текущее назначение.`
      );
      return;
    }
    
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

  const isExistingUserHeadInAnotherOrg =
    !!existingUser?.isHead &&
    !!existingUser.currentHeadOrganization?.id &&
    existingUser.currentHeadOrganization.id !== selectedOrg?.id;

  useEffect(() => {
    if (isExistingUserHeadInAnotherOrg && userConfirmed) {
      setUserConfirmed(false);
      setFormData((prev) => ({
        ...prev,
        existingUserId: "",
      }));
    }
  }, [isExistingUserHeadInAnotherOrg, userConfirmed]);

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

  const loadWorkplaceMappings = async (ppoOrganizationId: string) => {
    try {
      const res = await fetch(`/api/admin/workplace-ppo-mapping?ppoOrganizationId=${encodeURIComponent(ppoOrganizationId)}`);
      if (res.ok) {
        const data = await res.json();
        setWorkplaceMappings((data.mappings || []).map((m: { id: string; workplaceName: string; workplaceInn: string }) => ({ id: m.id, workplaceName: m.workplaceName, workplaceInn: m.workplaceInn })));
      } else {
        setWorkplaceMappings([]);
      }
    } catch (e) {
      console.error("Ошибка загрузки привязок мест работы:", e);
      setWorkplaceMappings([]);
    }
  };

  const addWorkplaceMapping = async (workplaceInn?: string, workplaceName?: string) => {
    const inn = (workplaceInn ?? newWorkplaceInn).trim();
    const name = (workplaceName ?? newWorkplaceName).trim();
    if (!selectedOrg?.id || !inn || !name) {
      alertError("Укажите ИНН и название организации (юр. лица)");
      return;
    }
    setAddingMapping(true);
    try {
      const res = await fetch("/api/admin/workplace-ppo-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workplaceInn: inn,
          workplaceName: name,
          ppoOrganizationId: selectedOrg.id,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setWorkplaceMappings((prev) => [...prev, { id: data.mapping.id, workplaceName: name, workplaceInn: inn }]);
        setNewWorkplaceInn("");
        setNewWorkplaceName("");
        if (workplaceInn !== undefined) {
          setDadataSearch("");
          setDadataSuggestions([]);
          setDadataOpen(false);
        }
        alertSuccess("Место работы привязано.");
      } else {
        const err = await res.json();
        alertError(err.error || "Ошибка при добавлении привязки");
      }
    } catch (e) {
      console.error(e);
      alertError("Ошибка при добавлении привязки");
    } finally {
      setAddingMapping(false);
    }
  };

  const deleteWorkplaceMapping = async (id: string) => {
    setDeletingMappingId(id);
    try {
      const res = await fetch(`/api/admin/workplace-ppo-mapping/${id}`, { method: "DELETE" });
      if (res.ok) {
        setWorkplaceMappings((prev) => prev.filter((m) => m.id !== id));
        alertSuccess("Привязка удалена.");
      } else {
        const err = await res.json();
        alertError(err.error || "Ошибка при удалении");
      }
    } catch (e) {
      console.error(e);
      alertError("Ошибка при удалении");
    } finally {
      setDeletingMappingId(null);
    }
  };

  useEffect(() => {
    const canHaveWorkplace = formData.type === "PRIMARY" || formData.type === "REGIONAL" || formData.type === "LOCAL";
    if (isEditing && selectedOrg?.id && canHaveWorkplace) {
      loadWorkplaceMappings(selectedOrg.id);
    } else {
      setWorkplaceMappings([]);
      setNewWorkplaceInn("");
      setNewWorkplaceName("");
      setDadataSearch("");
      setDadataSuggestions([]);
    }
  }, [isEditing, selectedOrg?.id, formData.type]);

  // Поиск через DaData по названию или ИНН (debounce)
  useEffect(() => {
    const q = dadataSearch.trim();
    if (!q) {
      setDadataSuggestions([]);
      setDadataLoading(false);
      return;
    }
    const timer = setTimeout(async () => {
      setDadataLoading(true);
      try {
        const isInn = /^\d{10}$|^\d{12}$/.test(q);
        const url = isInn
          ? `/api/dadata/companies?inn=${encodeURIComponent(q)}`
          : `/api/dadata/companies?query=${encodeURIComponent(q)}&workplaceOnly=1`;
        const res = await fetch(url);
        if (!res.ok) {
          setDadataSuggestions([]);
          return;
        }
        const data = await res.json();
        if (data.company) {
          const c = data.company;
          setDadataSuggestions([{ inn: c.inn, name: c.name?.full || c.name?.short || "" }]);
          setDadataOpen(true);
        } else if (data.suggestions?.length) {
          setDadataSuggestions(
            data.suggestions.map((s: { data: { inn: string; name: { full?: string; short?: string } }; value?: string }) => ({
              inn: s.data.inn,
              name: s.data.name?.full || s.data.name?.short || s.value || "",
            }))
          );
          setDadataOpen(true);
        } else {
          setDadataSuggestions([]);
        }
      } catch (e) {
        console.error("DaData search error:", e);
        setDadataSuggestions([]);
      } finally {
        setDadataLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [dadataSearch]);

  // Закрытие выпадающего списка DaData при клике снаружи
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dadataWrapperRef.current && !dadataWrapperRef.current.contains(e.target as Node)) {
        setDadataOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
      // Поля председателя необязательны. Инвайт отправляется только если заполнены все четыре: ФИО, email, телефон.
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
        
        // Инвайт отправляем не всегда:
        // - при создании организации;
        // - при явном подтверждении существующего пользователя;
        // - при вводе данных нового пользователя (без existingUserId).
        // Если в редактировании подгружен уже назначенный председатель (existingUserId, без подтверждения),
        // повторно инвайт не отправляем.
        const hasChairmanContacts = !!(
          formData.chairmanEmail &&
          formData.chairmanPhone
        );
        const shouldSendInvite =
          hasChairmanContacts && (isCreating || userConfirmed || !formData.existingUserId || !!existingUser);

        if (shouldSendInvite) {
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
                existingUserId: formData.existingUserId || existingUser?.id || undefined, // Автоматически используем найденного пользователя
              }),
            });

            if (!inviteResponse.ok) {
              const inviteError = await inviteResponse.json();
              console.error("Ошибка отправки инвайта:", inviteError);
              const inviteErrorText = String(inviteError?.error || "");
              const isAlreadyChairmanError = inviteErrorText.includes("уже является председателем этой организации");
              if (isAlreadyChairmanError) {
                alertSuccess("Организация успешно сохранена. Председатель уже назначен для этой организации.");
              } else {
                alertError(`Организация сохранена, но не удалось отправить инвайт: ${inviteError.error || "Неизвестная ошибка"}`);
              }
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

  // Фильтрация организаций по поиску, типу и букве
  const filteredOrganizations = organizations.filter((org) => {
    const matchesType = filterType === "ALL" || org.type === filterType;
    const matchesSearch =
      !searchQuery.trim() ||
      org.name.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
      (org.chairmanName?.toLowerCase().includes(searchQuery.trim().toLowerCase())) ||
      (org.inn?.includes(searchQuery.trim()));
    const firstChar = org.name.trim().charAt(0).toUpperCase();
    const isDigit = /^[0-9]/.test(org.name.trim());
    const letterKey = isDigit ? "0-9" : firstChar;
    const matchesLetter = !letterFilter || letterKey === letterFilter;
    return matchesType && matchesSearch && matchesLetter;
  });

  // Буквы, для которых есть организации (по текущему списку с учётом типа и поиска)
  const availableLetters = React.useMemo(() => {
    const filtered = organizations.filter((org) => {
      const matchesType = filterType === "ALL" || org.type === filterType;
      const matchesSearch =
        !searchQuery.trim() ||
        org.name.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
        (org.chairmanName?.toLowerCase().includes(searchQuery.trim().toLowerCase())) ||
        (org.inn?.includes(searchQuery.trim()));
      return matchesType && matchesSearch;
    });
    const set = new Set<string>();
    filtered.forEach((org) => {
      const firstChar = org.name.trim().charAt(0).toUpperCase();
      set.add(/^[0-9]/.test(org.name.trim()) ? "0-9" : firstChar);
    });
    return Array.from(set).sort((a, b) => (a === "0-9" ? 1 : b === "0-9" ? -1 : a.localeCompare(b, "ru")));
  }, [organizations, filterType, searchQuery]);

  // Построение дерева организаций (сортировка по названию А–Я)
  const buildTree = (orgs: Organization[]): Organization[] => {
    const orgMap = new Map<string, Organization>();
    const rootOrgs: Organization[] = [];

    orgs.forEach((org) => {
      orgMap.set(org.id, { ...org, children: [] });
    });

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

    const sortTree = (nodes: Organization[]): Organization[] => {
      return nodes
        .sort((a, b) => a.name.localeCompare(b.name, "ru"))
        .map((node) => ({
          ...node,
          children: node.children?.length ? sortTree(node.children) : [],
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

  const tree = buildTree(filteredOrganizations);

  const TYPE_OPTIONS: { value: OrganizationType | "ALL"; label: string }[] = [
    { value: "ALL", label: "Все" },
    { value: "REGIONAL", label: "Региональные (РПО)" },
    { value: "LOCAL", label: "Местные (МПО)" },
    { value: "PRIMARY", label: "ППО" },
    { value: "FEDERAL", label: "ФПО" },
  ];

  return (
    <div className="space-y-6 min-w-0 w-full">
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

      {/* Поиск, тип, алфавит */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-[200px] flex-1">
            <label htmlFor="org-search" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Поиск
            </label>
            <input
              id="org-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Название, председатель, ИНН..."
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div>
            <label htmlFor="org-type-filter" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Тип
            </label>
            <select
              id="org-type-filter"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as OrganizationType | "ALL")}
              className="rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">А–Я:</span>
          <button
            type="button"
            onClick={() => setLetterFilter(null)}
            className={`rounded px-2 py-1 text-sm font-medium ${
              letterFilter === null
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            }`}
          >
            Все
          </button>
          {availableLetters.map((letter) => (
            <button
              key={letter}
              type="button"
              onClick={() => setLetterFilter(letter)}
              className={`rounded px-2 py-1 text-sm font-medium ${
                letterFilter === letter
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              }`}
            >
              {letter}
            </button>
          ))}
        </div>
        {(searchQuery || filterType !== "ALL" || letterFilter) && (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Показано: {filteredOrganizations.length} из {organizations.length} организаций
          </p>
        )}
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
                  type="button"
                  aria-label="Закрыть окно"
                  title="Закрыть"
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
              <label htmlFor="org-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Название организации *
              </label>
              <input
                id="org-name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                placeholder="Например: МООП РЗ РФ"
              />
            </div>

            <div>
              <label htmlFor="org-type" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Тип организации *
              </label>
              <select
                id="org-type"
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
              <label htmlFor="org-parent" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Родительская организация
              </label>
              <select
                id="org-parent"
                value={formData.parentId}
                onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
              >
                <option value="">Нет (корневая организация)</option>
                {[...organizations]
                  .filter((org) => org.id !== selectedOrg?.id)
                  .sort((a, b) => a.name.localeCompare(b.name, "ru"))
                  .map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.fullPath || org.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-800/50">
              <h3 className="mb-2 text-base font-semibold text-gray-900 dark:text-white">
                Реквизиты юр. лица (фирмы)
              </h3>
              <p className="mb-3 text-xs text-gray-600 dark:text-gray-400">
                Для любой организации (в т.ч. региональной, местной, федеральной — например МООП РЗ) можно указать ИНН, адрес и контакты юр. лица (аппарата).
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="org-inn" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    ИНН
                  </label>
                  <input
                    id="org-inn"
                    type="text"
                    value={formData.inn}
                    onChange={(e) => setFormData({ ...formData, inn: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                    placeholder="10 цифр"
                  />
                </div>
                <div>
                  <label htmlFor="org-phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Телефон
                  </label>
                  <input
                    id="org-phone"
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                  />
                </div>
              </div>
              <div className="mt-4">
                <label htmlFor="org-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Email
                </label>
                <input
                  id="org-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                />
              </div>
              <div className="mt-4">
                <label htmlFor="org-address" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Адрес
                </label>
                <textarea
                  id="org-address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                  rows={2}
                />
              </div>
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
              <h3 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
                Председатель организации <span className="font-normal text-gray-500">(необязательно)</span>
              </h3>
              
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Фамилия
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
                    Имя
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
                    Email председателя
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
                    Телефон председателя
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
                            {existingUser.isHead && existingUser.currentHeadOrganization && (
                              <span className="ml-1">
                                (уже председатель: {existingUser.currentHeadOrganization.name})
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-yellow-600 dark:text-yellow-400">
                        {isExistingUserHeadInAnotherOrg
                          ? "Этот пользователь уже назначен председателем в другой организации. Использовать его для текущей организации нельзя."
                          : "Если вы подтвердите, этому пользователю будут предоставлены права председателя ППО. Он сможет переключаться между режимами «Член профсоюза» и «Председатель ППО»."}
                      </p>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={confirmExistingUser}
                          disabled={isExistingUserHeadInAnotherOrg}
                          className={`rounded px-3 py-1.5 text-xs font-medium text-white ${
                            isExistingUserHeadInAnotherOrg
                              ? "cursor-not-allowed bg-gray-400"
                              : "bg-yellow-600 hover:bg-yellow-700"
                          }`}
                        >
                          {isExistingUserHeadInAnotherOrg
                            ? "Нельзя использовать (уже председатель)"
                            : "Подтвердить и использовать данные"}
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
              {userConfirmed && existingUser && !isExistingUserHeadInAnotherOrg && (
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

            {/* Привязанные места работы (юр. лица) — для ППО, региональных и местных организаций */}
            {isEditing && selectedOrg && (formData.type === "PRIMARY" || formData.type === "REGIONAL" || formData.type === "LOCAL") && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
                <h3 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
                  Привязанные места работы (юр. лица)
                </h3>
                <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
                  {formData.type === "PRIMARY"
                    ? "По ИНН и названию места работы пользователям будет подставляться это ППО."
                    : "Для региональных и местных организаций место работы — как правило, сама организация (аппарат). Укажите ИНН и название юр. лица — пользователям будет подставляться ППО этой организации (например, ППО аппарата)."}
                </p>
                <div ref={dadataWrapperRef} className="relative mb-4">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Помочь заполнить через DaData (по названию или ИНН)
                  </label>
                  <input
                    type="text"
                    value={dadataSearch}
                    onChange={(e) => setDadataSearch(e.target.value)}
                    onFocus={() => dadataSuggestions.length > 0 && setDadataOpen(true)}
                    placeholder="Введите название юр. лица или ИНН (10 цифр)"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700"
                  />
                  {dadataLoading && (
                    <span className="absolute right-3 top-8 text-xs text-gray-500">поиск…</span>
                  )}
                  {dadataOpen && dadataSuggestions.length > 0 && (
                    <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded border border-gray-300 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800">
                      {dadataSuggestions.map((s, i) => (
                        <li key={`${s.inn}-${i}`}>
                          <button
                            type="button"
                            onClick={() => addWorkplaceMapping(s.inn, s.name)}
                            disabled={addingMapping}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            <span className="truncate font-medium">{s.name}</span>
                            <span className="shrink-0 text-gray-500">ИНН {s.inn}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {workplaceMappings.length > 0 && (
                  <ul className="mb-4 space-y-2">
                    {workplaceMappings.map((m) => (
                      <li key={m.id} className="flex items-center justify-between rounded border border-gray-200 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-700">
                        <span className="text-sm">
                          <span className="font-medium">{m.workplaceName}</span>
                          <span className="ml-2 text-gray-500">ИНН {m.workplaceInn}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => deleteWorkplaceMapping(m.id)}
                          disabled={deletingMappingId === m.id}
                          className="rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-50"
                        >
                          {deletingMappingId === m.id ? "…" : "Удалить"}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[120px] flex-1">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">ИНН</label>
                    <input
                      type="text"
                      value={newWorkplaceInn}
                      onChange={(e) => setNewWorkplaceInn(e.target.value)}
                      placeholder="10 цифр"
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700"
                    />
                  </div>
                  <div className="min-w-[200px] flex-1">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Название юр. лица</label>
                    <input
                      type="text"
                      value={newWorkplaceName}
                      onChange={(e) => setNewWorkplaceName(e.target.value)}
                      placeholder="ГБУЗ МО «Солнечногорская больница»"
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => addWorkplaceMapping()}
                    disabled={addingMapping || !newWorkplaceInn.trim() || !newWorkplaceName.trim()}
                    className="rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {addingMapping ? "…" : "Добавить"}
                  </button>
                </div>
              </div>
            )}

            {/* Управление подпиской (для ППО) — суперадмин */}
            {isEditing && selectedOrg && formData.type === "PRIMARY" && (
              <OrgSubscriptionManage
                organizationId={selectedOrg.id}
                organizationName={selectedOrg.name}
              />
            )}

            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {formData.type === "PRIMARY" ? "Активна подписка (доступ к платформе)" : "Активна"}
                </span>
              </label>
              {formData.type === "PRIMARY" && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Если снять галочку, все пользователи этой организации будут видеть только раздел «Подписка и оплата».
                </p>
              )}
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

