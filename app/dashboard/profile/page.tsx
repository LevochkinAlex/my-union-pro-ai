"use client";

import { useEffect, useMemo, useState } from "react";
import PhoneInput from "@/components/form/PhoneInput";
import AddressInput from "@/components/form/AddressInput";
import DateInput from "@/components/form/DateInput";
import AvatarUpload from "@/components/profile/AvatarUpload";
import Autocomplete from "@/components/form/Autocomplete";
import OrganizationAutocomplete from "@/components/form/OrganizationAutocomplete";
import EmailValidationField from "@/components/form/EmailValidationField";
import WorkplaceSearch from "@/components/profile/WorkplaceSearch";
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
  // Место работы (обязательное для заявлений)
  workplace: string;
  workplaceInn: string;
  directorName: string;
  directorPosition: string;
  email: string;
  preferredDiscountCity: string; // Предпочтительный город для скидок
  avatarUrl: string | null;
  organizationId: string | null;
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
  // Профессия и образование перенесены из основного профиля
  profession: string;
  education: string;
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

interface Profession {
  name: string;
  experience: string;
}

interface Education {
  level: string;
  institution: string;
  year: string;
  specialty: string;
}

interface ChildrenState {
  children: Child[];
}

type TabKey = "profile" | "additional" | "membership" | "education" | "awards";

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState<TabKey>("profile");
  const [isLoading, setIsLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [emailVerified, setEmailVerified] = useState<Date | null>(null);
  const [lastSavedField, setLastSavedField] = useState<string | null>(null);
  
  // Справочники профессий и должностей
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [professions, setProfessions] = useState<string[]>([]);
  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string; fullPath?: string; indentedName?: string; type?: string; level?: number }>>([]);

  const [profileData, setProfileData] = useState<ProfileData>({
    firstName: "",
    lastName: "",
    middleName: "",
    phone: "",
    dateOfBirth: "",
    address: "",
    jobTitle: "",
    workplace: "",
    workplaceInn: "",
    directorName: "",
    directorPosition: "",
    email: "",
    preferredDiscountCity: "",
    avatarUrl: null,
    organizationId: null,
    organization: null,
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
    profession: "",
    education: "",
  });
  
  const [children, setChildren] = useState<Child[]>([]);
  const [awards, setAwards] = useState<Award[]>([]);
  const [training, setTraining] = useState<Training[]>([]);
  const [professionsData, setProfessionsData] = useState<Profession[]>([]);
  const [educationsData, setEducationsData] = useState<Education[]>([]);
  const [childErrors, setChildErrors] = useState<Record<number, string>>({});
  
  // Состояния для управления формами добавления/редактирования
  const [isAddingAward, setIsAddingAward] = useState(false);
  const [editingAwardIndex, setEditingAwardIndex] = useState<number | null>(null);
  const [newAward, setNewAward] = useState<Award>({ type: "ведомственная", year: "", description: "" });
  
  const [isAddingEducation, setIsAddingEducation] = useState(false);
  const [editingEducationIndex, setEditingEducationIndex] = useState<number | null>(null);
  const [newEducation, setNewEducation] = useState<Education>({ level: "", institution: "", year: "", specialty: "" });
  
  const [isAddingProfession, setIsAddingProfession] = useState(false);
  const [editingProfessionIndex, setEditingProfessionIndex] = useState<number | null>(null);
  const [newProfession, setNewProfession] = useState<Profession>({ name: "", experience: "" });
  
  // Данные о членстве
  const [membershipData, setMembershipData] = useState<{
    unionCardNumber: string | null;
    membershipJoinedAt: string | null;
    membershipStatus: string;
    currentOrganization: {
      id: string | null;
      name: string;
      inn: string | null;
      chairmanName: string | null;
      type?: "linked" | "text"; // linked = из справочника, text = старое текстовое поле
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

  // Открыть форму добавления награды
  const openAddAwardForm = () => {
    setNewAward({ type: "ведомственная", year: "", description: "" });
    setIsAddingAward(true);
    setEditingAwardIndex(null);
  };

  // Отменить добавление награды
  const cancelAddAward = () => {
    setIsAddingAward(false);
    setNewAward({ type: "ведомственная", year: "", description: "" });
  };

  // Сохранить новую награду
  const saveAward = () => {
    if (!newAward.type || !newAward.year || !newAward.description.trim()) {
      setMessage({ type: "error", text: "Заполните все поля награды" });
      return;
    }
    
    if (editingAwardIndex !== null) {
      // Редактирование существующей награды
      const updatedAwards = [...awards];
      updatedAwards[editingAwardIndex] = { ...newAward };
      setAwards(updatedAwards);
      setEditingAwardIndex(null);
    } else {
      // Добавление новой награды
      setAwards([...awards, { ...newAward }]);
      setIsAddingAward(false);
    }
    
    setNewAward({ type: "ведомственная", year: "", description: "" });
    setMessage({ type: "success", text: "Награда сохранена. Не забудьте сохранить изменения внизу страницы." });
  };

  // Начать редактирование награды
  const startEditAward = (index: number) => {
    setNewAward({ ...awards[index] });
    setEditingAwardIndex(index);
    setIsAddingAward(true);
  };

  // Отменить редактирование награды
  const cancelEditAward = () => {
    setEditingAwardIndex(null);
    setIsAddingAward(false);
    setNewAward({ type: "ведомственная", year: "", description: "" });
  };

  // Удалить награду
  const removeAward = (index: number) => {
    if (confirm("Вы уверены, что хотите удалить эту награду?")) {
      setAwards(awards.filter((_, i) => i !== index));
      setMessage({ type: "success", text: "Награда удалена. Не забудьте сохранить изменения внизу страницы." });
    }
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

  // Открыть форму добавления профессии
  const openAddProfessionForm = () => {
    setNewProfession({ name: "", experience: "" });
    setIsAddingProfession(true);
    setEditingProfessionIndex(null);
  };

  // Отменить добавление профессии
  const cancelAddProfession = () => {
    setIsAddingProfession(false);
    setNewProfession({ name: "", experience: "" });
  };

  // Сохранить новую профессию
  const saveProfession = () => {
    if (!newProfession.name.trim() || !newProfession.experience.trim()) {
      setMessage({ type: "error", text: "Заполните все поля профессии" });
      return;
    }
    
    if (editingProfessionIndex !== null) {
      // Редактирование существующей профессии
      const updatedProfessions = [...professionsData];
      updatedProfessions[editingProfessionIndex] = { ...newProfession };
      setProfessionsData(updatedProfessions);
      setEditingProfessionIndex(null);
    } else {
      // Добавление новой профессии
      setProfessionsData([...professionsData, { ...newProfession }]);
      setIsAddingProfession(false);
    }
    
    setNewProfession({ name: "", experience: "" });
    setMessage({ type: "success", text: "Профессия сохранена. Не забудьте сохранить изменения внизу страницы." });
  };

  // Начать редактирование профессии
  const startEditProfession = (index: number) => {
    setNewProfession({ ...professionsData[index] });
    setEditingProfessionIndex(index);
    setIsAddingProfession(true);
  };

  // Отменить редактирование профессии
  const cancelEditProfession = () => {
    setEditingProfessionIndex(null);
    setIsAddingProfession(false);
    setNewProfession({ name: "", experience: "" });
  };

  // Удалить профессию
  const removeProfession = (index: number) => {
    if (confirm("Вы уверены, что хотите удалить эту профессию?")) {
      setProfessionsData(professionsData.filter((_, i) => i !== index));
      setMessage({ type: "success", text: "Профессия удалена. Не забудьте сохранить изменения внизу страницы." });
    }
  };

  // Открыть форму добавления образования
  const openAddEducationForm = () => {
    setNewEducation({ level: "", institution: "", year: "", specialty: "" });
    setIsAddingEducation(true);
    setEditingEducationIndex(null);
  };

  // Отменить добавление образования
  const cancelAddEducation = () => {
    setIsAddingEducation(false);
    setNewEducation({ level: "", institution: "", year: "", specialty: "" });
  };

  // Сохранить новое образование
  const saveEducation = () => {
    if (!newEducation.level || !newEducation.institution.trim() || !newEducation.year || !newEducation.specialty.trim()) {
      setMessage({ type: "error", text: "Заполните все поля образования" });
      return;
    }
    
    if (editingEducationIndex !== null) {
      // Редактирование существующего образования
      const updatedEducations = [...educationsData];
      updatedEducations[editingEducationIndex] = { ...newEducation };
      setEducationsData(updatedEducations);
      setEditingEducationIndex(null);
    } else {
      // Добавление нового образования
      setEducationsData([...educationsData, { ...newEducation }]);
      setIsAddingEducation(false);
    }
    
    setNewEducation({ level: "", institution: "", year: "", specialty: "" });
    setMessage({ type: "success", text: "Образование сохранено. Не забудьте сохранить изменения внизу страницы." });
  };

  // Начать редактирование образования
  const startEditEducation = (index: number) => {
    setNewEducation({ ...educationsData[index] });
    setEditingEducationIndex(index);
    setIsAddingEducation(true);
  };

  // Отменить редактирование образования
  const cancelEditEducation = () => {
    setEditingEducationIndex(null);
    setIsAddingEducation(false);
    setNewEducation({ level: "", institution: "", year: "", specialty: "" });
  };

  // Удалить образование
  const removeEducation = (index: number) => {
    if (confirm("Вы уверены, что хотите удалить это образование?")) {
      setEducationsData(educationsData.filter((_, i) => i !== index));
      setMessage({ type: "success", text: "Образование удалено. Не забудьте сохранить изменения внизу страницы." });
    }
  };

  const [savingAdditionalInfo, setSavingAdditionalInfo] = useState(false);

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
        workplace: user.workplace ?? "",
        workplaceInn: user.workplaceInn ?? "",
        directorName: user.directorName ?? "",
        directorPosition: user.directorPosition ?? "",
        email: user.email,
        preferredDiscountCity: user.preferredDiscountCity ?? "",
        avatarUrl: user.avatarUrl ?? null,
        organizationId: user.organization?.id || null,
        organization: user.organization,
      });
      setEmailVerified(user.emailVerified ? new Date(user.emailVerified) : null);
      
      // Обновляем дополнительную информацию (включая профессию и образование)
      setAdditionalInfo(prev => ({
        ...prev,
        profession: user.profession ?? "",
        education: user.education ?? "",
      }));
    } catch (error) {
      console.error(error);
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Ошибка загрузки профиля" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  // Загрузка справочников профессий и должностей
  useEffect(() => {
    const loadDictionaries = async () => {
      try {
        const [dictionariesRes, orgsRes] = await Promise.all([
          fetch("/api/dictionaries"),
          fetch("/api/organizations"),
        ]);

        if (dictionariesRes.ok) {
          const data = await dictionariesRes.json();
          setJobTitles(data.jobTitles || []);
          setProfessions(data.professions || []);
        }

        if (orgsRes.ok) {
          const data = await orgsRes.json();
          setOrganizations(data.flatList || data.organizations || []);
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
          profession: data.profession ?? "",
          education: data.education ?? "",
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

        // Парсим профессии из JSON (новое поле professions)
        if (data.professions) {
          try {
            const parsedProfessions = JSON.parse(data.professions);
            if (Array.isArray(parsedProfessions)) {
              setProfessionsData(parsedProfessions);
            }
          } catch (error) {
            console.error("Failed to parse professions data:", error);
          }
        } else if (data.profession) {
          // Миграция со старого поля profession на новое professions
          setProfessionsData([{ name: data.profession, experience: "" }]);
        }

        // Парсим образования из JSON (новое поле educations)
        if (data.educations) {
          try {
            const parsedEducations = JSON.parse(data.educations);
            if (Array.isArray(parsedEducations)) {
              setEducationsData(parsedEducations);
            }
          } catch (error) {
            console.error("Failed to parse educations data:", error);
          }
        } else if (data.education) {
          // Миграция со старого поля education на новое educations
          setEducationsData([{ level: data.education, institution: "", year: "", specialty: "" }]);
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

  // Отдельный обработчик для адреса (AddressInput может передавать строку напрямую)
  const handleAddressChange = (value: string) => {
    setProfileData((prev) => ({
      ...prev,
      address: value,
    }));
  };

  const handleNameChange = (name: "firstName" | "lastName" | "middleName") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // Для отчества применяем особую логику
    if (name === "middleName") {
      // Форматируем отчество с заглавной буквы
      setProfileData((prev) => ({
        ...prev,
        [name]: capitalizeName(value),
      }));
    } else {
      setProfileData((prev) => ({
        ...prev,
        [name]: capitalizeName(value),
      }));
    }
  };

  // Функция автосохранения отдельного поля
  const autoSaveField = async (fieldName: string, value: any) => {
    if (autoSaving) return; // Предотвращаем множественные одновременные запросы
    
    setAutoSaving(true);
    setLastSavedField(fieldName);
    
    try {
      const payload: any = {};
      
      // Подготавливаем данные для отправки
      if (fieldName === 'organizationId') {
        payload.organizationId = value || null;
      } else {
        payload[fieldName] = value;
      }

      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Не удалось сохранить");
      }

      // Обновляем organization объект, если изменилась организация
      if (fieldName === 'organizationId' && value) {
        const selectedOrg = organizations.find(org => org.id === value);
        if (selectedOrg) {
          setProfileData(prev => ({
            ...prev,
            organization: {
              id: selectedOrg.id,
              name: selectedOrg.name || selectedOrg.fullPath || '',
              inn: null, // ИНН можно получить из API если нужно
            }
          }));
        }
      }
    } catch (error) {
      console.error(`[autoSave] Error saving field ${fieldName}:`, error);
      // Не показываем ошибку пользователю при автосохранении, только в консоль
    } finally {
      setAutoSaving(false);
      // Убираем индикатор через 2 секунды
      setTimeout(() => setLastSavedField(null), 2000);
    }
  };

  const handleFieldBlur = (fieldName: string, value: any) => {
    // Автосохранение при потере фокуса
    autoSaveField(fieldName, value);
  };

  const handleProfileSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      // Не отправляем email и organization, так как email обновляется через EmailValidationField,
      // а organization - это только для отображения, отправляем organizationId
      const { email, organization, ...profileDataToSend } = profileData;
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(profileDataToSend),
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
      
      // Преобразуем профессии в JSON формат
      const professionsJSON = professionsData.length > 0 ? JSON.stringify(professionsData) : "";
      
      // Преобразуем образования в JSON формат
      const educationsJSON = educationsData.length > 0 ? JSON.stringify(educationsData) : "";
      
      const dataToSend = {
        ...additionalInfo,
        maritalStatus: enumMaritalStatus,
        childrenBirthDates: childrenJSON,
        awards: awardsJSON,
        training: trainingJSON,
        professions: professionsJSON,
        educations: educationsJSON,
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
      
      // Обновляем avatarUrl - компонент AvatarUpload сам обработает его через getFileUrl
      setProfileData(prev => ({ ...prev, avatarUrl: data.avatarUrl }));
      setMessage({ type: "success", text: "Фото профиля успешно обновлено" });
      
      // Не перезагружаем весь профиль сразу, чтобы не потерять временное превью
      // Обновление URL выше достаточно для обновления изображения
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
            onClick={() => setActiveTab("education")}
            className={`whitespace-nowrap border-b-2 px-1 py-3 text-xs font-medium md:py-4 md:text-sm ${
              activeTab === "education"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            Образование
          </button>
          <button
            onClick={() => setActiveTab("awards")}
            className={`whitespace-nowrap border-b-2 px-1 py-3 text-xs font-medium md:py-4 md:text-sm ${
              activeTab === "awards"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            Награды
          </button>
        </nav>
      </div>

      {activeTab === "profile" && (
      <div className="w-full max-w-5xl rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 md:p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white md:text-lg">Информация о профиле</h3>
        
        {/* Avatar Upload */}
        <div className="mt-4 mb-6 border-b border-gray-200 pb-4 dark:border-gray-700 md:mt-6 md:mb-8 md:pb-6">
          <AvatarUpload 
            currentAvatarUrl={profileData.avatarUrl} 
            onSave={handleAvatarSave}
            userName={[profileData.lastName, profileData.firstName, profileData.middleName].filter(Boolean).join(" ") || undefined}
          />
        </div>
        
        <form onSubmit={handleProfileSubmit} className="mt-4 space-y-6">
          {/* Организация профсоюза - ПЕРВОЕ ПОЛЕ, на всю ширину */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
              Организация профсоюза <span className="text-red-500">*</span>
            </label>
            <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
              В какую организацию профсоюза вы хотите вступить?
            </p>
            <OrganizationAutocomplete
              value={profileData.organizationId || ""}
              onChange={(organizationId) => {
                // Используем функциональное обновление для сохранения всех полей
                setProfileData(prev => ({ ...prev, organizationId: organizationId || null }));
                // Автосохранение при выборе организации
                if (organizationId) {
                  handleFieldBlur("organizationId", organizationId);
                }
              }}
              options={organizations}
              placeholder="Начните вводить название организации..."
            />
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Фамилия <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="lastName"
                value={profileData.lastName}
                onChange={handleNameChange("lastName")}
                onBlur={() => handleFieldBlur("lastName", profileData.lastName)}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Имя <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="firstName"
                value={profileData.firstName}
                onChange={handleNameChange("firstName")}
                onBlur={() => handleFieldBlur("firstName", profileData.firstName)}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Отчество <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="middleName"
                value={profileData.middleName}
                onChange={handleNameChange("middleName")}
                onBlur={() => handleFieldBlur("middleName", profileData.middleName)}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                placeholder="Например: Петрович"
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Дата рождения <span className="text-red-500">*</span>
              </label>
              <DateInput
                name="dateOfBirth"
                value={profileData.dateOfBirth}
                onChange={handleProfileChange}
                onBlur={() => handleFieldBlur("dateOfBirth", profileData.dateOfBirth)}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Телефон <span className="text-red-500">*</span>
              </label>
              <PhoneInput
                name="phone"
                value={profileData.phone}
                onChange={handleProfileChange}
                onBlur={() => handleFieldBlur("phone", profileData.phone)}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Адрес проживания <span className="text-red-500">*</span>
              </label>
              <AddressInput
                name="address"
                value={profileData.address}
                onChange={handleAddressChange}
                onBlur={() => handleFieldBlur("address", profileData.address)}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div>
              <WorkplaceSearch
                value={profileData.workplace ? {
                  name: profileData.workplace,
                  inn: profileData.workplaceInn,
                  directorName: profileData.directorName,
                  directorPosition: profileData.directorPosition,
                } : null}
                onChange={(workplace) => {
                  if (workplace) {
                    // Используем функциональное обновление для сохранения всех полей
                    setProfileData(prev => ({
                      ...prev,
                      workplace: workplace.name,
                      workplaceInn: workplace.inn,
                      directorName: workplace.directorName,
                      directorPosition: workplace.directorPosition,
                    }));
                    // Автосохранение
                    handleFieldBlur("workplace", workplace.name);
                  } else {
                    // Используем функциональное обновление для сохранения всех полей
                    setProfileData(prev => ({
                      ...prev,
                      workplace: "",
                      workplaceInn: "",
                      directorName: "",
                      directorPosition: "",
                    }));
                  }
                }}
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Должность <span className="text-red-500">*</span>
              </label>
              <Autocomplete
                name="jobTitle"
                value={profileData.jobTitle}
                onChange={(value) => {
                  // Используем функциональное обновление для сохранения всех полей
                  setProfileData(prev => ({ ...prev, jobTitle: value }));
                  // Автосохранение при выборе из списка
                  if (jobTitles.includes(value)) {
                    handleFieldBlur("jobTitle", value);
                  }
                }}
                options={jobTitles}
                placeholder="Начните вводить должность..."
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
                onBlur={() => handleFieldBlur("preferredDiscountCity", profileData.preferredDiscountCity)}
                placeholder="Например: Москва, Санкт-Петербург, Казань..."
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Информация об аккаунте</h3>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <EmailValidationField
                  email={profileData.email || ""}
                  emailVerified={emailVerified}
                  onEmailChange={(email) => {
                    // Используем функциональное обновление для сохранения всех полей
                    setProfileData(prev => ({ ...prev, email }));
                    // После изменения email нужно перезагрузить профиль чтобы получить обновленный emailVerified
                    if (emailVerified) {
                      setEmailVerified(null);
                    }
                  }}
                  onVerified={async () => {
                    // Перезагружаем профиль чтобы получить обновленный emailVerified
                    try {
                      const response = await fetch("/api/profile");
                      if (response.ok) {
                        const data = await response.json();
                        setEmailVerified(data.user.emailVerified ? new Date(data.user.emailVerified) : null);
                        // Используем функциональное обновление для сохранения всех полей
                        setProfileData(prev => ({ ...prev, email: data.user.email || "" }));
                      }
                    } catch (error) {
                      console.error("Failed to reload profile:", error);
                    }
                  }}
                />
              </div>
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

      {activeTab === "education" && (
      <div className="w-full max-w-5xl rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 md:p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white md:text-lg">Образование и профессиональные навыки</h3>
        <p className="mt-2 text-xs text-gray-600 dark:text-gray-400 md:text-sm">
          Укажите ваше образование, профессии и обучение
        </p>
        <form onSubmit={handleAdditionalInfoSubmit} className="mt-6 space-y-6">
            
            {/* Профессии */}
            <div className="mb-6">
              {/* Кнопка добавления профессии */}
              {!isAddingProfession && (
                <div className="mb-4 flex justify-end">
                  <button
                    type="button"
                    onClick={openAddProfessionForm}
                    className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Добавить профессию
                  </button>
                </div>
              )}

              {/* Форма добавления/редактирования профессии */}
              {isAddingProfession && (
                <div className="mb-6 rounded-lg border-2 border-blue-300 bg-blue-50 p-4 dark:border-blue-600 dark:bg-blue-900/20">
                  <h4 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">
                    {editingProfessionIndex !== null ? "Редактирование профессии" : "Добавление профессии"}
                  </h4>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                          Название профессии <span className="text-red-500">*</span>
                        </label>
                        <Autocomplete
                          name="new-profession-name"
                          value={newProfession.name}
                          onChange={(value) => setNewProfession({ ...newProfession, name: value })}
                          options={professions}
                          placeholder="Например: Медсестра, Врач..."
                          className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                        />
                      </div>
                      
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                          Опыт работы <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={newProfession.experience}
                          onChange={(e) => setNewProfession({ ...newProfession, experience: e.target.value })}
                          placeholder="5 лет"
                          className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                        />
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        onClick={editingProfessionIndex !== null ? cancelEditProfession : cancelAddProfession}
                        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        Отмена
                      </button>
                      <button
                        type="button"
                        onClick={saveProfession}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {editingProfessionIndex !== null ? "Сохранить изменения" : "Добавить профессию"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Список профессий */}
              {professionsData.length === 0 && !isAddingProfession ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-700 dark:bg-gray-900">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                    У вас пока нет добавленных профессий
                  </p>
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    Нажмите "Добавить профессию" чтобы начать
                  </p>
                </div>
              ) : (
                professionsData.length > 0 && (
                  <div className="space-y-3">
                    {professionsData.map((prof, index) => (
                      <div
                        key={index}
                        className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:flex-row sm:items-center"
                      >
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">{prof.name}</p>
                          {prof.experience && (
                            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{prof.experience}</p>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => startEditProfession(index)}
                            className="inline-flex items-center justify-center rounded-lg bg-blue-600 p-2 text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            title="Редактировать"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => removeProfession(index)}
                            className="inline-flex items-center justify-center rounded-lg bg-red-600 p-2 text-white shadow-sm transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                            title="Удалить"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>

            {/* Образование */}
            <div>
              {/* Кнопка добавления образования */}
              {!isAddingEducation && (
                <div className="mb-4 flex justify-end">
                  <button
                    type="button"
                    onClick={openAddEducationForm}
                    className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Добавить образование
                  </button>
                </div>
              )}

              {/* Форма добавления/редактирования образования */}
              {isAddingEducation && (
                <div className="mb-6 rounded-lg border-2 border-blue-300 bg-blue-50 p-4 dark:border-blue-600 dark:bg-blue-900/20">
                  <h4 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">
                    {editingEducationIndex !== null ? "Редактирование образования" : "Добавление образования"}
                  </h4>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                          Уровень образования <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={newEducation.level}
                          onChange={(e) => setNewEducation({ ...newEducation, level: e.target.value })}
                          className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                        >
                          <option value="">Выберите уровень</option>
                          {EDUCATION_LEVELS.map((level) => (
                            <option key={level} value={level}>
                              {level}
                            </option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                          Год окончания <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={newEducation.year}
                          onChange={(e) => setNewEducation({ ...newEducation, year: e.target.value })}
                          placeholder="2020"
                          maxLength={4}
                          className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                        />
                      </div>
                      
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                          Учебное заведение <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={newEducation.institution}
                          onChange={(e) => setNewEducation({ ...newEducation, institution: e.target.value })}
                          placeholder="Название университета/колледжа..."
                          className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                        />
                      </div>
                      
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                          Специальность <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={newEducation.specialty}
                          onChange={(e) => setNewEducation({ ...newEducation, specialty: e.target.value })}
                          placeholder="Например: Медицина, Информатика..."
                          className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                        />
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        onClick={editingEducationIndex !== null ? cancelEditEducation : cancelAddEducation}
                        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        Отмена
                      </button>
                      <button
                        type="button"
                        onClick={saveEducation}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {editingEducationIndex !== null ? "Сохранить изменения" : "Добавить образование"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Список образований */}
              {educationsData.length === 0 && !isAddingEducation ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-700 dark:bg-gray-900">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                    У вас пока нет добавленного образования
                  </p>
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    Нажмите "Добавить образование" чтобы начать
                  </p>
                </div>
              ) : (
                educationsData.length > 0 && (
                  <div className="space-y-3">
                    {educationsData.map((edu, index) => (
                      <div
                        key={index}
                        className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:flex-row sm:items-center"
                      >
                        <div className="flex-1">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900 dark:text-white">{edu.level}</span>
                            {edu.year && (
                              <span className="text-sm text-gray-600 dark:text-gray-400">({edu.year})</span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{edu.institution}</p>
                          {edu.specialty && (
                            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{edu.specialty}</p>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => startEditEducation(index)}
                            className="inline-flex items-center justify-center rounded-lg bg-blue-600 p-2 text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            title="Редактировать"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => removeEducation(index)}
                            className="inline-flex items-center justify-center rounded-lg bg-red-600 p-2 text-white shadow-sm transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                            title="Удалить"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>

            {/* Обучение */}
            <div>
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
                            placeholder="Например: Семинар по охране труда"
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

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingAdditionalInfo}
                className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
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
                  Организация
                </label>
                <p className="text-base font-medium text-gray-900 dark:text-white">
                  {membershipData.currentOrganization.name}
                </p>
                {membershipData.currentOrganization.type === "text" && (
                  <p className="mt-2 text-xs text-orange-600 dark:text-orange-400">
                    ⚠️ Организация не привязана к справочнику. Пожалуйста, обновите профиль и выберите организацию из списка.
                  </p>
                )}
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

            {/* Если нет организации вообще */}
            {!membershipData.currentOrganization && (
              <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-900/20">
                <p className="text-sm text-orange-800 dark:text-orange-200">
                  ⚠️ Организация не указана. Пожалуйста, заполните анкету и выберите организацию из списка.
                </p>
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

      {activeTab === "awards" && (
      <div className="w-full max-w-5xl rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 md:p-6">
        <div className="mb-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white md:text-lg">Награды и достижения</h3>
          <p className="mt-2 text-xs text-gray-600 dark:text-gray-400 md:text-sm">
            Укажите ваши награды (ведомственные, государственные, профсоюзные)
          </p>
        </div>

        <form onSubmit={handleAdditionalInfoSubmit} className="space-y-6">
          {/* Кнопка добавления награды */}
          {!isAddingAward && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={openAddAwardForm}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Добавить награду
              </button>
            </div>
          )}

          {/* Форма добавления/редактирования награды */}
          {isAddingAward && (
            <div className="rounded-lg border-2 border-blue-300 bg-blue-50 p-4 dark:border-blue-600 dark:bg-blue-900/20">
              <h4 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">
                {editingAwardIndex !== null ? "Редактирование награды" : "Добавление награды"}
              </h4>
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                      Тип награды <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={newAward.type}
                      onChange={(e) => setNewAward({ ...newAward, type: e.target.value as Award["type"] })}
                      className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    >
                      <option value="ведомственная">Ведомственная</option>
                      <option value="государственная">Государственная</option>
                      <option value="профсоюзная">Профсоюзная</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                      Год <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newAward.year}
                      onChange={(e) => setNewAward({ ...newAward, year: e.target.value })}
                      placeholder="2020"
                      maxLength={4}
                      className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    />
                  </div>
                  
                  <div className="sm:col-span-1">
                    <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                      Описание <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newAward.description}
                      onChange={(e) => setNewAward({ ...newAward, description: e.target.value })}
                      placeholder="Описание награды"
                      className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    />
                  </div>
                </div>
                
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={editingAwardIndex !== null ? cancelEditAward : cancelAddAward}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={saveAward}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {editingAwardIndex !== null ? "Сохранить изменения" : "Добавить награду"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Список наград */}
          {awards.length === 0 && !isAddingAward ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-700 dark:bg-gray-900">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
              <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                У вас пока нет добавленных наград
              </p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                Нажмите "Добавить награду" чтобы начать
              </p>
            </div>
          ) : (
            awards.length > 0 && (
              <div className="space-y-3">
                {awards.map((award, index) => (
                  <div
                    key={index}
                    className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:flex-row sm:items-center"
                  >
                    <div className="flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">
                          {award.type === "ведомственная" ? "Ведомственная" : award.type === "государственная" ? "Государственная" : "Профсоюзная"}
                        </span>
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{award.year}</span>
                      </div>
                      <p className="text-sm text-gray-900 dark:text-white">{award.description}</p>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startEditAward(index)}
                        className="inline-flex items-center justify-center rounded-lg bg-blue-600 p-2 text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        title="Редактировать"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeAward(index)}
                        className="inline-flex items-center justify-center rounded-lg bg-red-600 p-2 text-white shadow-sm transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                        title="Удалить"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Кнопка сохранения всех изменений */}
          <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
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
    </div>
  );
}
