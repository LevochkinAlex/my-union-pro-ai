"use client";

import { useEffect, useMemo, useState } from "react";
import PhoneInput from "@/components/form/PhoneInput";
import AddressInput from "@/components/form/AddressInput";
import DateInput from "@/components/form/DateInput";
import AvatarUpload from "@/components/profile/AvatarUpload";
import Autocomplete from "@/components/form/Autocomplete";
import { EDUCATION_LEVELS } from "@/lib/constants/education";
import { capitalizeName } from "@/lib/utils/nameFormatting";

// Маппинг между enum значениями в БД и человекочитаемыми значениями
const MARITAL_STATUS_MAP = {
  SINGLE: "Не женат/Не замужем",
  MARRIED: "Женат/Замужем",
  DIVORCED: "В разводе",
  WIDOWED: "Вдовец/Вдова",
  CIVIL_UNION: "В гражданском браке",
} as const;

// Обратный маппинг
const MARITAL_STATUS_REVERSE_MAP = Object.fromEntries(
  Object.entries(MARITAL_STATUS_MAP).map(([key, value]) => [value, key])
) as Record<string, string>;

interface ProfileData {
  firstName: string;
  lastName: string;
  middleName: string;
  phone: string;
  dateOfBirth: string;
  address: string;
  jobTitle: string;
  profession: string;
  education: string;
  email: string;
  preferredDiscountCity: string; // Предпочтительный город для скидок
  avatarUrl: string | null;
  organization?: {
    id: string;
    name: string;
    inn: string | null;
  } | null;
}

interface Child {
  name: string;
  birthDate: string;
  gender: "М" | "Ж" | "";
  age?: number;
}

interface AdditionalInfo {
  employmentStatus: string;
  hobbies: string;
  aboutMe: string;
  hasChildren: boolean | null;
  childrenInfo: string;
  childrenBirthDates: string;
  maritalStatus: string;
  spouseInfo: string;
  awards: string;
  training: string;
  additionalInfo: string;
}

interface Award {
  type: "ведомственная" | "государственная" | "профсоюзная";
  year: string;
  description: string;
}

interface Training {
  name: string;
  year: string;
  description: string;
}

interface ChildrenState {
  children: Child[];
}

type TabKey = "profile" | "additional" | "membership" | "security";

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState<TabKey>("profile");
  const [isLoading, setIsLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  
  // Справочники профессий и должностей
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [professions, setProfessions] = useState<string[]>([]);

  const [profileData, setProfileData] = useState<ProfileData>({
    firstName: "",
    lastName: "",
    middleName: "",
    phone: "",
    dateOfBirth: "",
    address: "",
    jobTitle: "",
    profession: "",
    education: "",
    email: "",
    preferredDiscountCity: "",
    avatarUrl: null,
    organization: null,
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [additionalInfo, setAdditionalInfo] = useState<AdditionalInfo>({
    employmentStatus: "",
    hobbies: "",
    aboutMe: "",
    hasChildren: null,
    childrenInfo: "",
    childrenBirthDates: "",
    maritalStatus: "",
    spouseInfo: "",
    awards: "",
    training: "",
    additionalInfo: "",
  });
  
  const [children, setChildren] = useState<Child[]>([]);
  const [awards, setAwards] = useState<Award[]>([]);
  const [training, setTraining] = useState<Training[]>([]);
  const [childErrors, setChildErrors] = useState<Record<number, string>>({});
  
  // Данные о членстве
  const [membershipData, setMembershipData] = useState<{
    unionCardNumber: string | null;
    membershipJoinedAt: string | null;
    membershipStatus: string;
    currentOrganization: {
      id: string;
      name: string;
      inn: string | null;
      chairmanName: string | null;
    } | null;
    history: Array<{
      id: string;
      organizationName: string;
      organizationId: string | null;
      status: string;
      statusDate: string;
      notes: string | null;
    }>;
  } | null>(null);
  const [loadingMembership, setLoadingMembership] = useState(false);
  const [generatingDocument, setGeneratingDocument] = useState<"removal" | "transfer" | null>(null);
  
  // Вычисление возраста
  const calculateAge = (birthDate: Date): number => {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };
  
  // Добавить ребенка
  const addChild = () => {
    setChildren([...children, { name: "", birthDate: "", gender: "" }]);
  };
  
  // Удалить ребенка
  const removeChild = (index: number) => {
    setChildren(children.filter((_, i) => i !== index));
    // Удаляем ошибку для удаленного ребенка
    const updatedErrors = { ...childErrors };
    delete updatedErrors[index];
    // Сдвигаем индексы ошибок для оставшихся детей
    const newErrors: Record<number, string> = {};
    Object.keys(updatedErrors).forEach((key) => {
      const oldIndex = parseInt(key);
      if (oldIndex > index) {
        newErrors[oldIndex - 1] = updatedErrors[oldIndex];
      } else if (oldIndex < index) {
        newErrors[oldIndex] = updatedErrors[oldIndex];
      }
    });
    setChildErrors(newErrors);
  };
  
  // Обновить данные ребенка
  const updateChild = (index: number, field: keyof Child, value: string) => {
    const updatedChildren = [...children];
    const updatedErrors = { ...childErrors };
    
    updatedChildren[index] = {
      ...updatedChildren[index],
      [field]: value,
    };
    
    // Если обновляется дата рождения, пересчитываем возраст и проверяем
    if (field === "birthDate" && value) {
      try {
        const birthDate = new Date(value);
        const age = calculateAge(birthDate);
        updatedChildren[index].age = age;
        
        // Проверка возраста: до 18 лет включительно
        if (age > 18) {
          updatedErrors[index] = "Возраст ребенка не может быть больше 18 лет";
        } else {
          delete updatedErrors[index];
        }
      } catch (error) {
        console.error("Invalid date:", error);
        updatedErrors[index] = "Неверный формат даты";
      }
    }
    
    setChildren(updatedChildren);
    setChildErrors(updatedErrors);
  };

  // Добавить награду
  const addAward = () => {
    setAwards([...awards, { type: "ведомственная", year: "", description: "" }]);
  };

  // Удалить награду
  const removeAward = (index: number) => {
    setAwards(awards.filter((_, i) => i !== index));
  };

  // Обновить данные награды
  const updateAward = (index: number, field: keyof Award, value: string) => {
    const updatedAwards = [...awards];
    updatedAwards[index] = {
      ...updatedAwards[index],
      [field]: value,
    };
    setAwards(updatedAwards);
  };

  // Добавить обучение
  const addTraining = () => {
    setTraining([...training, { name: "", year: "", description: "" }]);
  };

  // Удалить обучение
  const removeTraining = (index: number) => {
    setTraining(training.filter((_, i) => i !== index));
  };

  // Обновить данные обучения
  const updateTraining = (index: number, field: keyof Training, value: string) => {
    const updatedTraining = [...training];
    updatedTraining[index] = {
      ...updatedTraining[index],
      [field]: value,
    };
    setTraining(updatedTraining);
  };

  const [savingAdditionalInfo, setSavingAdditionalInfo] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setIsLoading(true);
        const response = await fetch("/api/profile");
        if (!response.ok) {
          throw new Error("Не удалось загрузить профиль");
        }
        const data = await response.json();
        const user = data.user;
        setProfileData({
          firstName: user.firstName ?? "",
          lastName: user.lastName ?? "",
          middleName: user.middleName ?? "",
          phone: user.phone ?? "",
          dateOfBirth: user.dateOfBirth ? new Date(user.dateOfBirth).toISOString().split("T")[0] : "",
          address: user.address ?? "",
          jobTitle: user.jobTitle ?? "",
          profession: user.profession ?? "",
          education: user.education ?? "",
          email: user.email,
          preferredDiscountCity: user.preferredDiscountCity ?? "",
          avatarUrl: user.avatarUrl ?? null,
          organization: user.organization,
        });
      } catch (error) {
        console.error(error);
        setMessage({ type: "error", text: error instanceof Error ? error.message : "Ошибка загрузки профиля" });
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, []);

  // Загрузка справочников профессий и должностей
  useEffect(() => {
    const loadDictionaries = async () => {
      try {
        const response = await fetch("/api/dictionaries");
        if (response.ok) {
          const data = await response.json();
          setJobTitles(data.jobTitles || []);
          setProfessions(data.professions || []);
        }
      } catch (error) {
        console.error("Failed to load dictionaries:", error);
      }
    };

    loadDictionaries();
  }, []);

  useEffect(() => {
    const loadAdditionalInfo = async () => {
      try {
        const response = await fetch("/api/profile/additional-info");
        if (!response.ok) {
          throw new Error("Не удалось загрузить дополнительную информацию");
        }
        const data = await response.json();
        
        // Конвертируем enum значение в человекочитаемое
        const displayMaritalStatus = data.maritalStatus 
          ? (MARITAL_STATUS_MAP[data.maritalStatus as keyof typeof MARITAL_STATUS_MAP] || data.maritalStatus)
          : "";
        
        setAdditionalInfo({
          employmentStatus: data.employmentStatus ?? "",
          hobbies: data.hobbies ?? "",
          aboutMe: data.aboutMe ?? "",
          hasChildren: data.hasChildren,
          childrenInfo: data.childrenInfo ?? "",
          childrenBirthDates: data.childrenBirthDates ?? "",
          maritalStatus: displayMaritalStatus,
          spouseInfo: data.spouseInfo ?? "",
          awards: data.awards ?? "",
          training: data.training ?? "",
          additionalInfo: data.additionalInfo ?? "",
        });
        
        // Парсим детей из JSON
        if (data.childrenBirthDates) {
          try {
            const parsedChildren = JSON.parse(data.childrenBirthDates);
            if (Array.isArray(parsedChildren)) {
              const errors: Record<number, string> = {};
              const childrenWithAge = parsedChildren.map((child: any, index: number) => {
                const age = child.birthDate ? calculateAge(new Date(child.birthDate)) : undefined;
                // Проверяем возраст при загрузке
                if (age !== undefined && age > 18) {
                  errors[index] = "Возраст ребенка не может быть больше 18 лет";
                }
                return {
                  name: child.name || "",
                  birthDate: child.birthDate || "",
                  gender: child.gender || "",
                  age,
                };
              });
              setChildren(childrenWithAge);
              if (Object.keys(errors).length > 0) {
                setChildErrors(errors);
              }
            }
          } catch (error) {
            console.error("Failed to parse children data:", error);
          }
        }

        // Парсим награды из JSON
        if (data.awards) {
          try {
            const parsedAwards = JSON.parse(data.awards);
            if (Array.isArray(parsedAwards)) {
              setAwards(parsedAwards);
            }
          } catch (error) {
            console.error("Failed to parse awards data:", error);
          }
        }

        // Парсим обучение из JSON
        if (data.training) {
          try {
            const parsedTraining = JSON.parse(data.training);
            if (Array.isArray(parsedTraining)) {
              setTraining(parsedTraining);
            }
          } catch (error) {
            console.error("Failed to parse training data:", error);
          }
        }
      } catch (error) {
        console.error(error);
      }
    };

    loadAdditionalInfo();
  }, []);

  // Загрузка данных о членстве
  useEffect(() => {
    const loadMembershipData = async () => {
      try {
        setLoadingMembership(true);
        const response = await fetch("/api/profile/membership");
        if (!response.ok) {
          throw new Error("Не удалось загрузить информацию о членстве");
        }
        const data = await response.json();
        setMembershipData(data);
      } catch (error) {
        console.error(error);
        setMessage({ type: "error", text: error instanceof Error ? error.message : "Ошибка загрузки данных о членстве" });
      } finally {
        setLoadingMembership(false);
      }
    };

    if (activeTab === "membership") {
      loadMembershipData();
    }
  }, [activeTab]);

  // Обработчик генерации заявления о снятии с учета
  const handleGenerateRemoval = async () => {
    if (!confirm("Вы уверены, что хотите сгенерировать заявление о снятии с учета?")) {
      return;
    }

    setGeneratingDocument("removal");
    try {
      const response = await fetch("/api/profile/membership/generate-removal", {
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Не удалось сгенерировать заявление");
      }

      const data = await response.json();
      setMessage({ type: "success", text: "Заявление о снятии с учета успешно сгенерировано и добавлено в документы" });
      
      // Перезагружаем данные о членстве
      const membershipResponse = await fetch("/api/profile/membership");
      if (membershipResponse.ok) {
        const membershipData = await membershipResponse.json();
        setMembershipData(membershipData);
      }
    } catch (error) {
      console.error(error);
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Ошибка генерации заявления" });
    } finally {
      setGeneratingDocument(null);
    }
  };

  // Обработчик генерации заявления о переходе
  const handleGenerateTransfer = async () => {
    if (!confirm("Вы уверены, что хотите сгенерировать заявление о переходе в другой профсоюз?")) {
      return;
    }

    setGeneratingDocument("transfer");
    try {
      const response = await fetch("/api/profile/membership/generate-transfer", {
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Не удалось сгенерировать заявление");
      }

      const data = await response.json();
      setMessage({ type: "success", text: "Заявление о переходе в другой профсоюз успешно сгенерировано и добавлено в документы" });
      
      // Перезагружаем данные о членстве
      const membershipResponse = await fetch("/api/profile/membership");
      if (membershipResponse.ok) {
        const membershipData = await membershipResponse.json();
        setMembershipData(membershipData);
      }
    } catch (error) {
      console.error(error);
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Ошибка генерации заявления" });
    } finally {
      setGeneratingDocument(null);
    }
  };

  useEffect(() => {
    if (message) {
      const timeout = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timeout);
    }
  }, [message]);

  const isProfileChanged = useMemo(() => {
    // This simple flag indicates that we have editable fields filled (always allow save)
    return true;
  }, [profileData]);

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setProfileData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleNameChange = (name: "firstName" | "lastName" | "middleName") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // Для отчества применяем особую логику
    if (name === "middleName") {
      // Разбиваем отчество на части
      const parts = value.trim().toLowerCase().split(/\s+/);
      
      // Форматируем каждую часть
      const formatted = parts.map(part => {
        // Тюркские суффиксы остаются с маленькой буквы
        if (["оглы", "кызы", "улы", "гызы", "огли", "кизи"].includes(part)) {
          return part;
        }
        // Остальные части с заглавной буквы
        return capitalizeName(part);
      }).join(" ");
      
      setProfileData((prev) => ({
        ...prev,
        [name]: formatted,
      }));
    } else {
      setProfileData((prev) => ({
        ...prev,
        [name]: capitalizeName(value),
      }));
    }
  };
  
  // Проверяем, есть ли тюркский суффикс в отчестве
  const hasTurkicSuffix = (middleName: string): boolean => {
    const lower = middleName.toLowerCase();
    return /\s(оглы|кызы|улы|гызы|огли|кизи)$/.test(lower) || 
           ["оглы", "кызы", "улы", "гызы", "огли", "кизи"].some(suffix => lower === suffix);
  };
  
  // Добавить тюркский суффикс к отчеству
  const addTurkicSuffix = (suffix: string) => {
    const currentMiddleName = profileData.middleName.trim();
    if (!currentMiddleName) return;
    
    // Удаляем существующий суффикс, если есть
    const withoutSuffix = currentMiddleName.replace(/\s+(оглы|кызы|улы|гызы|огли|кизи)$/i, '');
    
    // Добавляем новый суффикс
    setProfileData((prev) => ({
      ...prev,
      middleName: `${withoutSuffix} ${suffix}`,
    }));
  };

  const handleProfileSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(profileData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Не удалось обновить профиль");
      }

      setMessage({ type: "success", text: "Профиль успешно обновлен" });
    } catch (error) {
      console.error(error);
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Ошибка обновления профиля" });
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setMessage({ type: "error", text: "Новый пароль и подтверждение не совпадают" });
      return;
    }

    setChangingPassword(true);
    try {
      const response = await fetch("/api/profile/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Не удалось изменить пароль");
      }

      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setMessage({ type: "success", text: "Пароль успешно изменен" });
    } catch (error) {
      console.error(error);
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Ошибка изменения пароля" });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleAdditionalInfoChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (type === "checkbox") {
      const checked = (e.target as HTMLInputElement).checked;
      setAdditionalInfo((prev) => ({
        ...prev,
        [name]: checked,
      }));
    } else {
      setAdditionalInfo((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const handleAdditionalInfoSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Проверка возраста детей перед сохранением
    const hasErrors = children.some((child, index) => {
      if (child.birthDate) {
        try {
          const birthDate = new Date(child.birthDate);
          const age = calculateAge(birthDate);
          if (age > 18) {
            setChildErrors(prev => ({ ...prev, [index]: "Возраст ребенка не может быть больше 18 лет" }));
            return true;
          }
        } catch (error) {
          setChildErrors(prev => ({ ...prev, [index]: "Неверный формат даты" }));
          return true;
        }
      }
      return false;
    });
    
    if (hasErrors) {
      setMessage({ type: "error", text: "Пожалуйста, исправьте ошибки в данных о детях" });
      return;
    }
    
    setSavingAdditionalInfo(true);
    try {
      // Конвертируем человекочитаемое значение обратно в enum
      const enumMaritalStatus = additionalInfo.maritalStatus 
        ? (MARITAL_STATUS_REVERSE_MAP[additionalInfo.maritalStatus] || additionalInfo.maritalStatus)
        : "";
      
      // Преобразуем детей в JSON формат
      const childrenJSON = children.length > 0 
        ? JSON.stringify(children.map(child => ({
            name: child.name,
            birthDate: child.birthDate,
            gender: child.gender,
          })))
        : "";
      
      // Преобразуем награды в JSON формат
      const awardsJSON = awards.length > 0 ? JSON.stringify(awards) : "";
      
      // Преобразуем обучение в JSON формат
      const trainingJSON = training.length > 0 ? JSON.stringify(training) : "";
      
      const dataToSend = {
        ...additionalInfo,
        maritalStatus: enumMaritalStatus,
        childrenBirthDates: childrenJSON,
        awards: awardsJSON,
        training: trainingJSON,
        hasChildren: children.length > 0 ? true : additionalInfo.hasChildren,
      };
      
      const response = await fetch("/api/profile/additional-info", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(dataToSend),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Не удалось обновить дополнительную информацию");
      }

      setMessage({ type: "success", text: "Дополнительная информация успешно обновлена" });
    } catch (error) {
      console.error(error);
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Ошибка обновления данных" });
    } finally {
      setSavingAdditionalInfo(false);
    }
  };

  const handleAvatarSave = async (croppedImageBlob: Blob) => {
    try {
      const formData = new FormData();
      formData.append("avatar", croppedImageBlob, "avatar.jpg");

      const response = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Не удалось загрузить фото");
      }

      const data = await response.json();
      setProfileData(prev => ({ ...prev, avatarUrl: data.avatarUrl }));
      setMessage({ type: "success", text: "Фото профиля успешно обновлено" });
    } catch (error) {
      console.error(error);
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Ошибка загрузки фото" });
      throw error; // Re-throw to let AvatarUpload handle it
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
          <p className="text-gray-600 dark:text-gray-400">Загрузка профиля...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white md:text-3xl">Профиль пользователя</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 md:text-base">
          Здесь вы можете обновить свои данные и настроить безопасность аккаунта
        </p>
      </div>

      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm shadow-sm ${
            message.type === "success"
              ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-200"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-4 overflow-x-auto md:space-x-8">
          <button
            onClick={() => setActiveTab("profile")}
            className={`whitespace-nowrap border-b-2 px-1 py-3 text-xs font-medium md:py-4 md:text-sm ${
              activeTab === "profile"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            Профиль
          </button>
          <button
            onClick={() => setActiveTab("additional")}
            className={`whitespace-nowrap border-b-2 px-1 py-3 text-xs font-medium md:py-4 md:text-sm ${
              activeTab === "additional"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            Дополнительная информация
          </button>
          <button
            onClick={() => setActiveTab("membership")}
            className={`whitespace-nowrap border-b-2 px-1 py-3 text-xs font-medium md:py-4 md:text-sm ${
              activeTab === "membership"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            Членство
          </button>
          <button
            onClick={() => setActiveTab("security")}
            className={`whitespace-nowrap border-b-2 px-1 py-3 text-xs font-medium md:py-4 md:text-sm ${
              activeTab === "security"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            Безопасность
          </button>
        </nav>
      </div>

      {activeTab === "profile" && (
      <div className="w-full max-w-5xl rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 md:p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white md:text-lg">Информация о профиле</h3>
        
        {/* Avatar Upload */}
        <div className="mt-4 mb-6 border-b border-gray-200 pb-4 dark:border-gray-700 md:mt-6 md:mb-8 md:pb-6">
          <AvatarUpload currentAvatarUrl={profileData.avatarUrl} onSave={handleAvatarSave} />
        </div>
        
        <form onSubmit={handleProfileSubmit} className="mt-4 space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">Фамилия</label>
              <input
                type="text"
                name="lastName"
                value={profileData.lastName}
                onChange={handleNameChange("lastName")}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">Имя</label>
              <input
                type="text"
                name="firstName"
                value={profileData.firstName}
                onChange={handleNameChange("firstName")}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">Отчество</label>
              <input
                type="text"
                name="middleName"
                value={profileData.middleName}
                onChange={handleNameChange("middleName")}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                placeholder="Например: Петрович или Ахмедович оглы"
              />
              {/* Подсказка для тюркских суффиксов */}
              {profileData.middleName && !hasTurkicSuffix(profileData.middleName) && (
                <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
                  <p className="mb-2 text-xs text-blue-800 dark:text-blue-300">
                    Если ваше отчество тюркского происхождения, добавьте суффикс:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => addTurkicSuffix("оглы")}
                      className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 transition"
                    >
                      + оглы (сын)
                    </button>
                    <button
                      type="button"
                      onClick={() => addTurkicSuffix("кызы")}
                      className="rounded-md bg-pink-600 px-3 py-1 text-xs font-medium text-white hover:bg-pink-700 transition"
                    >
                      + кызы (дочь)
                    </button>
                    <button
                      type="button"
                      onClick={() => addTurkicSuffix("улы")}
                      className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 transition"
                    >
                      + улы (сын, каз.)
                    </button>
                    <button
                      type="button"
                      onClick={() => addTurkicSuffix("гызы")}
                      className="rounded-md bg-purple-600 px-3 py-1 text-xs font-medium text-white hover:bg-purple-700 transition"
                    >
                      + гызы (дочь, азерб.)
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">Дата рождения</label>
              <DateInput
                name="dateOfBirth"
                value={profileData.dateOfBirth}
                onChange={handleProfileChange}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">Телефон</label>
              <PhoneInput
                name="phone"
                value={profileData.phone}
                onChange={handleProfileChange}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">Адрес проживания</label>
              <AddressInput
                name="address"
                value={profileData.address}
                onChange={handleProfileChange}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Предпочтительный город для скидок
                <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">(управляет фильтром скидок)</span>
              </label>
              <input
                type="text"
                name="preferredDiscountCity"
                value={profileData.preferredDiscountCity}
                onChange={handleProfileChange}
                placeholder="Например: Москва, Санкт-Петербург, Казань..."
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">Должность</label>
              <Autocomplete
                name="jobTitle"
                value={profileData.jobTitle}
                onChange={(value) => setProfileData({ ...profileData, jobTitle: value })}
                options={jobTitles}
                placeholder="Начните вводить должность..."
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">Профессия</label>
              <Autocomplete
                name="profession"
                value={profileData.profession}
                onChange={(value) => setProfileData({ ...profileData, profession: value })}
                options={professions}
                placeholder="Начните вводить профессию..."
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">Образование</label>
              <div className="relative">
                <select
                  name="education"
                  value={profileData.education}
                  onChange={handleProfileChange}
                  className="block w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2.5 pr-12 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
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
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Информация об аккаунте</h3>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Email</p>
                <p className="text-base font-medium text-gray-900 dark:text-white">{profileData.email}</p>
              </div>
              {profileData.organization && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Организация</p>
                  <p className="text-base font-medium text-gray-900 dark:text-white">
                    {profileData.organization.name}
                    {profileData.organization.inn ? ` (ИНН ${profileData.organization.inn})` : ""}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingProfile || !isProfileChanged}
              className="inline-flex items-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {savingProfile ? "Сохранение..." : "Сохранить изменения"}
            </button>
          </div>
        </form>
      </div>
      )}

      {activeTab === "additional" && (
      <div className="w-full max-w-5xl rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 md:p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white md:text-lg">Дополнительная информация</h3>
        <p className="mt-2 text-xs text-gray-600 dark:text-gray-400 md:text-sm">
          Заполните дополнительные сведения о себе для более персонализированного общения с AI-ботом
        </p>
        <form onSubmit={handleAdditionalInfoSubmit} className="mt-6 space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">Занятость</label>
              <div className="relative">
                <select
                  name="employmentStatus"
                  value={additionalInfo.employmentStatus}
                  onChange={handleAdditionalInfoChange}
                  className="block w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2.5 pr-12 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                >
                  <option value="">Выберите</option>
                  <option value="WORK">Работа</option>
                  <option value="STUDY">Учеба</option>
                  <option value="RETIREMENT">Пенсия</option>
                </select>
                <span className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500 dark:text-gray-400">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">Семейное положение</label>
              <div className="relative">
                <select
                  name="maritalStatus"
                  value={additionalInfo.maritalStatus}
                  onChange={handleAdditionalInfoChange}
                  className="block w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2.5 pr-12 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                >
                  <option value="">Выберите</option>
                  <option value="Не женат/Не замужем">Не женат/Не замужем</option>
                  <option value="Женат/Замужем">Женат/Замужем</option>
                  <option value="В разводе">В разводе</option>
                  <option value="Вдовец/Вдова">Вдовец/Вдова</option>
                  <option value="В гражданском браке">В гражданском браке</option>
                </select>
                <span className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500 dark:text-gray-400">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">Информация о супруге/супруге</label>
              <textarea
                name="spouseInfo"
                value={additionalInfo.spouseInfo}
                onChange={handleAdditionalInfoChange}
                placeholder="Имя, род занятий и другая информация о супруге"
                rows={3}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>

            <div className="flex items-center md:col-span-2">
              <input
                type="checkbox"
                id="hasChildren"
                name="hasChildren"
                checked={additionalInfo.hasChildren === true}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setAdditionalInfo((prev) => ({
                    ...prev,
                    hasChildren: checked,
                  }));
                }}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800"
              />
              <label htmlFor="hasChildren" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                У меня есть дети
              </label>
            </div>

            {additionalInfo.hasChildren && (
              <div className="md:col-span-2">
                <div className="mb-4 flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                    Информация о детях
                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                      (нужны для подарков к праздникам 🎁)
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={addChild}
                    className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Добавить ребенка
                  </button>
                </div>
                
                {children.length === 0 ? (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center dark:border-gray-700 dark:bg-gray-900">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Нажмите "Добавить ребенка" чтобы указать имя и дату рождения
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {children.map((child, index) => (
                      <div
                        key={index}
                        className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                          <div className="flex-1">
                            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                              Имя
                            </label>
                            <input
                              type="text"
                              value={child.name}
                              onChange={(e) => updateChild(index, "name", e.target.value)}
                              placeholder="Например: Фекла"
                              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                            />
                          </div>
                          
                          <div className="w-full sm:w-24">
                            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                              Пол
                            </label>
                            <div className="relative">
                              <select
                                value={child.gender}
                                onChange={(e) => updateChild(index, "gender", e.target.value)}
                                className="block w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2 pr-12 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                              >
                                <option value="">-</option>
                                <option value="М">М</option>
                                <option value="Ж">Ж</option>
                              </select>
                              <span className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500 dark:text-gray-400">
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex-1">
                            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                              Дата рождения
                            </label>
                            <input
                              type="date"
                              value={child.birthDate}
                              onChange={(e) => updateChild(index, "birthDate", e.target.value)}
                              max={new Date().toISOString().split('T')[0]}
                              className={`block w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 dark:bg-gray-800 dark:text-white ${
                                childErrors[index]
                                  ? "border-red-500 bg-red-50 text-gray-900 focus:border-red-500 focus:ring-red-500 dark:border-red-500 dark:bg-red-900/20"
                                  : "border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600"
                              }`}
                            />
                            {childErrors[index] && (
                              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{childErrors[index]}</p>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2">
                            {child.age !== undefined && (
                              <div className="flex items-center justify-center rounded-lg bg-blue-100 px-3 py-2 dark:bg-blue-900 h-[38px]">
                                <span className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                                  {child.age} {child.age === 1 ? 'год' : child.age < 5 ? 'года' : 'лет'}
                                </span>
                              </div>
                            )}
                            
                            <button
                              type="button"
                              onClick={() => removeChild(index)}
                              className="inline-flex items-center justify-center rounded-lg bg-red-600 p-2 text-white shadow-sm transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 h-[38px] w-[38px]"
                              title="Удалить"
                            >
                              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Старое поле для текстовой информации (опционально) */}
                <div className="mt-4">
                  <label className="mb-2 block text-xs font-medium text-gray-600 dark:text-gray-400">
                    Дополнительная информация о детях (опционально)
                  </label>
                  <textarea
                    name="childrenInfo"
                    value={additionalInfo.childrenInfo}
                    onChange={handleAdditionalInfoChange}
                    placeholder="Например: особенности, интересы, увлечения..."
                    rows={2}
                    className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  />
                </div>
              </div>
            )}

            {/* Награды */}
            <div className="md:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Награды (ведомственные, государственные, профсоюзные)
                </label>
                <button
                  type="button"
                  onClick={addAward}
                  className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Добавить награду
                </button>
              </div>
              
              {awards.length === 0 ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center dark:border-gray-700 dark:bg-gray-900">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Нажмите "Добавить награду" чтобы указать информацию о награде
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {awards.map((award, index) => (
                    <div
                      key={index}
                      className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <div className="w-full sm:w-48">
                          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                            Тип награды
                          </label>
                          <select
                            value={award.type}
                            onChange={(e) => updateAward(index, "type", e.target.value as Award["type"])}
                            className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                          >
                            <option value="ведомственная">Ведомственная</option>
                            <option value="государственная">Государственная</option>
                            <option value="профсоюзная">Профсоюзная</option>
                          </select>
                        </div>
                        
                        <div className="w-full sm:w-32">
                          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                            Год
                          </label>
                          <input
                            type="text"
                            value={award.year}
                            onChange={(e) => updateAward(index, "year", e.target.value)}
                            placeholder="YYYY"
                            maxLength={4}
                            className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                          />
                        </div>
                        
                        <div className="flex-1">
                          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                            Описание
                          </label>
                          <input
                            type="text"
                            value={award.description}
                            onChange={(e) => updateAward(index, "description", e.target.value)}
                            placeholder="Описание награды"
                            className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                          />
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => removeAward(index)}
                            className="inline-flex items-center justify-center rounded-lg bg-red-600 p-2 text-white shadow-sm transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 h-[38px] w-[38px]"
                            title="Удалить"
                          >
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Обучение */}
            <div className="md:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Обучение (семинары, школы актива, курсы повышения квалификации)
                </label>
                <button
                  type="button"
                  onClick={addTraining}
                  className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Добавить обучение
                </button>
              </div>
              
              {training.length === 0 ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center dark:border-gray-700 dark:bg-gray-900">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Нажмите "Добавить обучение" чтобы указать информацию об обучении
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {training.map((item, index) => (
                    <div
                      key={index}
                      className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <div className="flex-1">
                          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                            Название
                          </label>
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => updateTraining(index, "name", e.target.value)}
                            placeholder="Название семинара/курса"
                            className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                          />
                        </div>
                        
                        <div className="w-full sm:w-32">
                          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                            Год
                          </label>
                          <input
                            type="text"
                            value={item.year}
                            onChange={(e) => updateTraining(index, "year", e.target.value)}
                            placeholder="YYYY"
                            maxLength={4}
                            className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                          />
                        </div>
                        
                        <div className="flex-1">
                          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                            Описание
                          </label>
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => updateTraining(index, "description", e.target.value)}
                            placeholder="Описание обучения"
                            className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                          />
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => removeTraining(index)}
                            className="inline-flex items-center justify-center rounded-lg bg-red-600 p-2 text-white shadow-sm transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 h-[38px] w-[38px]"
                            title="Удалить"
                          >
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">Хобби и увлечения</label>
              <textarea
                name="hobbies"
                value={additionalInfo.hobbies}
                onChange={handleAdditionalInfoChange}
                placeholder="Ваши хобби, интересы и увлечения"
                rows={3}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">О себе</label>
              <textarea
                name="aboutMe"
                value={additionalInfo.aboutMe}
                onChange={handleAdditionalInfoChange}
                placeholder="Расскажите о себе: характер, привычки, что вас вдохновляет"
                rows={4}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">Дополнительная информация</label>
              <textarea
                name="additionalInfo"
                value={additionalInfo.additionalInfo}
                onChange={handleAdditionalInfoChange}
                placeholder="Любая другая информация, которой хотите поделиться"
                rows={4}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingAdditionalInfo}
              className="inline-flex items-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {savingAdditionalInfo ? "Сохранение..." : "Сохранить изменения"}
            </button>
          </div>
        </form>
      </div>
      )}

      {activeTab === "membership" && (
      <div className="w-full max-w-5xl rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 md:p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white md:text-lg">Профсоюзное членство</h3>
        <p className="mt-2 text-xs text-gray-600 dark:text-gray-400 md:text-sm">
          Информация о вашем членстве в профсоюзе
        </p>

        {loadingMembership ? (
          <div className="mt-6 flex items-center justify-center py-8">
            <div className="text-center">
              <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
              <p className="text-gray-600 dark:text-gray-400">Загрузка данных о членстве...</p>
            </div>
          </div>
        ) : membershipData ? (
          <div className="mt-6 space-y-6">
            {/* Номер профсоюзной карточки */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Номер профсоюзной карточки
              </label>
              <p className="text-lg font-mono font-semibold text-gray-900 dark:text-white">
                {membershipData.unionCardNumber || "Не назначен"}
              </p>
            </div>

            {/* Статус членства */}
            <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Статус членства
              </label>
              <div className="flex items-center gap-3">
                {membershipData.membershipStatus === "ACCEPTED" ? (
                  <>
                    <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800 dark:bg-green-900/30 dark:text-green-200">
                      Принят на учет
                    </span>
                    {membershipData.membershipJoinedAt && (
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        с {new Date(membershipData.membershipJoinedAt).toLocaleDateString("ru-RU")}
                      </span>
                    )}
                  </>
                ) : membershipData.membershipStatus === "REMOVED" ? (
                  <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800 dark:bg-red-900/30 dark:text-red-200">
                    Снят с учета
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-yellow-100 px-3 py-1 text-sm font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200">
                    Пока не принят
                  </span>
                )}
              </div>
            </div>

            {/* Текущая организация */}
            {membershipData.currentOrganization && (
              <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Текущая организация
                </label>
                <p className="text-base font-medium text-gray-900 dark:text-white">
                  {membershipData.currentOrganization.name}
                </p>
                {membershipData.currentOrganization.inn && (
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    ИНН: {membershipData.currentOrganization.inn}
                  </p>
                )}
                {membershipData.currentOrganization.chairmanName && (
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    Председатель: {membershipData.currentOrganization.chairmanName}
                  </p>
                )}
              </div>
            )}

            {/* История членства */}
            {membershipData.history && membershipData.history.length > 0 && (
              <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                <label className="mb-3 block text-sm font-medium text-gray-700 dark:text-gray-200">
                  История членства
                </label>
                <div className="space-y-3">
                  {membershipData.history.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {entry.organizationName}
                          </p>
                          <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                            {entry.status === "ACCEPTED"
                              ? "Принят на учет"
                              : entry.status === "REMOVED"
                              ? "Снят с учета"
                              : entry.status === "TRANSFERRED"
                              ? "Переведен"
                              : entry.status}
                          </p>
                          {entry.notes && (
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">{entry.notes}</p>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-500">
                          {new Date(entry.statusDate).toLocaleDateString("ru-RU")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Кнопки действий */}
            {membershipData.membershipStatus === "ACCEPTED" && (
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={handleGenerateRemoval}
                  disabled={generatingDocument === "removal"}
                  className="inline-flex items-center justify-center rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {generatingDocument === "removal" ? (
                    <>
                      <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                      Генерация...
                    </>
                  ) : (
                    "Снять с учета"
                  )}
                </button>
                <button
                  onClick={handleGenerateTransfer}
                  disabled={generatingDocument === "transfer"}
                  className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {generatingDocument === "transfer" ? (
                    <>
                      <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                      Генерация...
                    </>
                  ) : (
                    "Перейти в другой профсоюз"
                  )}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
            Не удалось загрузить данные о членстве
          </div>
        )}
      </div>
      )}

      {activeTab === "security" && (
      <div className="w-full max-w-lg rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 md:p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white md:text-lg">Изменение пароля</h3>
        <form onSubmit={handlePasswordSubmit} className="mt-4 space-y-6">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">Текущий пароль</label>
            <input
              type="password"
              name="currentPassword"
              value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              required
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">Новый пароль</label>
            <input
              type="password"
              name="newPassword"
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              minLength={8}
              required
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Минимум 8 символов</p>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">Подтверждение пароля</label>
            <input
              type="password"
              name="confirmPassword"
              value={passwordForm.confirmPassword}
              onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              minLength={8}
              required
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={changingPassword}
              className="inline-flex items-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {changingPassword ? "Изменение..." : "Изменить пароль"}
            </button>
          </div>
        </form>
      </div>
      )}
    </div>
  );
}
