"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { AlertTriangle } from "lucide-react";
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
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/modal";

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

interface AwardAttachment {
  url: string;
  fileName: string;
  mimeType?: string;
}

interface Award {
  type: "ведомственная" | "государственная" | "профсоюзная";
  year: string;
  description: string;
  attachments?: AwardAttachment[];
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
  const { update: updateSession } = useSession();
  const [activeTab, setActiveTab] = useState<TabKey>("profile");
  const [isLoading, setIsLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [emailVerified, setEmailVerified] = useState<Date | null>(null);
  const [lastSavedField, setLastSavedField] = useState<string | null>(null);
  const [dateOfBirthError, setDateOfBirthError] = useState<string | null>(null);
  
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
  const [newAward, setNewAward] = useState<Award>({ type: "ведомственная", year: "", description: "", attachments: [] });
  const [uploadingAwardFile, setUploadingAwardFile] = useState(false);
  const awardFileInputRef = useRef<HTMLInputElement>(null);
  
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
  const [showEditJoinedDateModal, setShowEditJoinedDateModal] = useState(false);
  const [editJoinedDateValue, setEditJoinedDateValue] = useState("");
  const [isSavingJoinedDate, setIsSavingJoinedDate] = useState(false);
  const [ppoOptionsForWorkplace, setPpoOptionsForWorkplace] = useState<Array<{ id: string; name: string }>>([]);
  const [ppoAutoFilled, setPpoAutoFilled] = useState(false);
  const [showManualPpo, setShowManualPpo] = useState(false);
  const [manualPpoText, setManualPpoText] = useState("");
  const [sendingPpoRequest, setSendingPpoRequest] = useState(false);
  
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
    setNewAward({ type: "ведомственная", year: "", description: "", attachments: [] });
  };

  const handleAwardFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploadingAwardFile(true);
    setMessage({ type: "error", text: "" });
    try {
      const form = new FormData();
      form.append("file", f);
      const res = await fetch("/api/profile/award-attachment", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Ошибка загрузки");
      const list = [...(newAward.attachments || []), data.attachment];
      setNewAward({ ...newAward, attachments: list });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Не удалось загрузить файл" });
    } finally {
      setUploadingAwardFile(false);
      e.target.value = "";
    }
  };

  const removeAwardAttachment = (index: number) => {
    const list = [...(newAward.attachments || [])];
    list.splice(index, 1);
    setNewAward({ ...newAward, attachments: list });
  };

  // Сохранить новую награду
  const saveAward = () => {
    if (!newAward.type || !newAward.year || !newAward.description.trim()) {
      setMessage({ type: "error", text: "Заполните все поля награды" });
      return;
    }
    
    // Валидация года - не должен быть в будущем
    const yearNum = parseInt(newAward.year, 10);
    const currentYear = new Date().getFullYear();
    if (isNaN(yearNum) || yearNum < 1900 || yearNum > currentYear) {
      setMessage({ type: "error", text: `Год награды должен быть от 1900 до ${currentYear}` });
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
    
    setNewAward({ type: "ведомственная", year: "", description: "", attachments: [] });
    setMessage({ type: "success", text: "Награда сохранена. Не забудьте сохранить изменения внизу страницы." });
  };

  // Начать редактирование награды
  const startEditAward = (index: number) => {
    const a = awards[index];
    setNewAward({ ...a, attachments: a.attachments || [] });
    setEditingAwardIndex(index);
    setIsAddingAward(true);
  };

  // Отменить редактирование награды
  const cancelEditAward = () => {
    setEditingAwardIndex(null);
    setIsAddingAward(false);
    setNewAward({ type: "ведомственная", year: "", description: "", attachments: [] });
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

  const loadProfile = async (retryCount = 0) => {
    const MAX_RETRIES = 2;
    try {
      setIsLoading(true);
      // Добавляем timestamp для предотвращения кеширования браузером
      const response = await fetch(`/api/profile?t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Не удалось загрузить профиль");
      }
      const data = await response.json();
      
      if (!data.user) {
        throw new Error("Данные профиля не получены");
      }
      
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
      
      // Очищаем предыдущее сообщение об ошибке при успешной загрузке
      if (message?.type === "error" && message?.text.includes("загрузить профиль")) {
        setMessage(null);
      }
    } catch (error) {
      console.error("Error loading profile:", error);
      const errorMessage = error instanceof Error ? error.message : "Ошибка загрузки профиля";
      
      // Повторяем попытку, если не достигнут лимит
      if (retryCount < MAX_RETRIES) {
        console.log(`Retrying profile load, attempt ${retryCount + 1}/${MAX_RETRIES}`);
        // Задержка перед повторной попыткой (1 секунда)
        await new Promise(resolve => setTimeout(resolve, 1000));
        return loadProfile(retryCount + 1);
      }
      
      setMessage({ type: "error", text: errorMessage });
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
          const allOrgs = data.flatList || data.organizations || [];
          // Фильтруем только ППО (тип PRIMARY)
          const ppoOrgs = allOrgs.filter((org: any) => org.type === "PRIMARY");
          setOrganizations(ppoOrgs);
        }
      } catch (error) {
        console.error("Failed to load dictionaries:", error);
      }
    };

    loadDictionaries();
  }, []);

  // Загрузка ППО по месту работы из справочника (при уже указанном месте работы, напр. после loadProfile)
  useEffect(() => {
    if (!profileData.workplace?.trim() || !profileData.workplaceInn?.trim()) {
      setPpoOptionsForWorkplace([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/workplace/ppo?workplaceName=${encodeURIComponent(profileData.workplace)}&workplaceInn=${encodeURIComponent(profileData.workplaceInn)}`
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        const list = data.ppoOrganizations || (data.ppoOrganization ? [data.ppoOrganization] : []);
        setPpoOptionsForWorkplace(Array.isArray(list) ? list : []);
        setPpoAutoFilled(list.length === 1);
      } catch {
        if (!cancelled) setPpoOptionsForWorkplace([]);
      }
    })();
    return () => { cancelled = true; };
  }, [profileData.workplace, profileData.workplaceInn]);

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
              setAwards(parsedAwards.map((a: Award) => ({ ...a, attachments: a.attachments || [] })));
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

  const openEditJoinedDateModal = () => {
    if (membershipData?.membershipJoinedAt) {
      setEditJoinedDateValue(new Date(membershipData.membershipJoinedAt).toISOString().split("T")[0]);
    } else {
      setEditJoinedDateValue(new Date().toISOString().split("T")[0]);
    }
    setShowEditJoinedDateModal(true);
  };

  const handleSaveJoinedDate = async () => {
    if (!editJoinedDateValue) return;
    setIsSavingJoinedDate(true);
    try {
      const res = await fetch("/api/profile/membership", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipJoinedAt: editJoinedDateValue }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Ошибка сохранения");
      setMessage({ type: "success", text: "Дата вступления обновлена. Потребуется перегенерировать заявления." });
      setShowEditJoinedDateModal(false);
      const refetch = await fetch("/api/profile/membership");
      if (refetch.ok) setMembershipData(await refetch.json());
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Не удалось сохранить дату" });
    } finally {
      setIsSavingJoinedDate(false);
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
    autoSaveField(fieldName, value);
  };

  const handleSendPpoNotInList = async () => {
    const text = manualPpoText.trim();
    if (!text) {
      setMessage({ type: "error", text: "Введите название вашей организации профсоюза (ППО)" });
      return;
    }
    setSendingPpoRequest(true);
    try {
      const res = await fetch("/api/ppo-not-in-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customPpoName: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка отправки");
      setMessage({ type: "success", text: data.message || "Заявка отправлена. Мы свяжемся с вами после добавления ППО." });
      setManualPpoText("");
      setShowManualPpo(false);
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Ошибка отправки заявки" });
    } finally {
      setSendingPpoRequest(false);
    }
  };

  const handleProfileSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      // Не отправляем email и organization, так как email обновляется через EmailValidationField,
      // а organization - это только для отображения, отправляем organizationId
      const { email, organization, organizationId, ...restData } = profileData;
      
      // ВАЖНО: organizationId отправляем только если он установлен (не null)
      // Если null - не включаем в запрос, чтобы API не стирало существующую организацию
      const profileDataToSend: any = { ...restData };
      if (organizationId) {
        profileDataToSend.organizationId = organizationId;
      }
      
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
      // Очищаем сообщение через 5 секунд
      setTimeout(() => setMessage(null), 5000);
    } catch (error) {
      console.error(error);
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Ошибка обновления профиля" });
      // Очищаем сообщение об ошибке через 5 секунд
      setTimeout(() => setMessage(null), 5000);
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
      
      // Если пользователь заполнил форму награды, но не нажал «Добавить» — включаем в сохранение
      let awardsToSave = [...awards];
      if (isAddingAward && newAward.type && newAward.year && newAward.description.trim()) {
        const yearNum = parseInt(newAward.year, 10);
        const currentYear = new Date().getFullYear();
        if (!isNaN(yearNum) && yearNum >= 1900 && yearNum <= currentYear) {
          awardsToSave = [...awardsToSave, { ...newAward }];
        }
      }
      const awardsJSON = awardsToSave.length > 0 ? JSON.stringify(awardsToSave) : "";
      
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
      // Очищаем сообщение через 5 секунд
      setTimeout(() => setMessage(null), 5000);
    } catch (error) {
      console.error(error);
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Ошибка обновления данных" });
    } finally {
      setSavingAdditionalInfo(false);
    }
  };

  const handleAvatarSave = async (croppedImageBlob: Blob) => {
    try {
      console.log("[Profile] Starting avatar upload, blob size:", croppedImageBlob.size, "type:", croppedImageBlob.type);
      
      const formData = new FormData();
      formData.append("avatar", croppedImageBlob, "avatar.jpg");

      console.log("[Profile] Sending avatar to server...");
      const response = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });

      console.log("[Profile] Avatar upload response status:", response.status, response.statusText);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Неизвестная ошибка" }));
        console.error("[Profile] Avatar upload error:", errorData);
        throw new Error(errorData.error || "Не удалось загрузить фото");
      }

      const data = await response.json();
      console.log("[Profile] Avatar uploaded successfully, new URL:", data.avatarUrl);
      
      // Обновляем avatarUrl - компонент AvatarUpload сам обработает его через getFileUrl
      setProfileData(prev => ({ ...prev, avatarUrl: data.avatarUrl }));
      
      // Обновляем сессию NextAuth, чтобы аватар обновился во всех компонентах
      try {
        await updateSession();
        console.log("[Profile] Session updated with new avatar");
      } catch (sessionError) {
        console.warn("[Profile] Failed to update session (non-critical):", sessionError);
      }
      
      setMessage({ type: "success", text: "Фото профиля успешно обновлено" });
      // Очищаем сообщение через 5 секунд
      setTimeout(() => setMessage(null), 5000);
    } catch (error) {
      console.error("[Profile] Avatar save error:", error);
      const errorMessage = error instanceof Error ? error.message : "Ошибка загрузки фото";
      setMessage({ type: "error", text: errorMessage });
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
          {/* Место работы и Должность — первая строка (как в анкете) */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Место работы <span className="text-red-500">*</span>
              </label>
              <WorkplaceSearch
                hideLabel
                value={profileData.workplace ? {
                  name: profileData.workplace,
                  inn: profileData.workplaceInn,
                  directorName: profileData.directorName,
                  directorPosition: profileData.directorPosition,
                } : null}
                onChange={async (workplace) => {
                  if (workplace) {
                    setProfileData(prev => ({
                      ...prev,
                      workplace: workplace.name,
                      workplaceInn: workplace.inn,
                      directorName: workplace.directorName,
                      directorPosition: workplace.directorPosition,
                    }));
                    handleFieldBlur("workplace", workplace.name);
                    try {
                      const response = await fetch(
                        `/api/workplace/ppo?workplaceName=${encodeURIComponent(workplace.name)}&workplaceInn=${encodeURIComponent(workplace.inn)}`
                      );
                      if (response.ok) {
                        const data = await response.json();
                        const list = data.ppoOrganizations || (data.ppoOrganization ? [data.ppoOrganization] : []);
                        setPpoOptionsForWorkplace(Array.isArray(list) ? list : []);
                        if (list.length === 1 && list[0]?.id) {
                          setProfileData(prev => ({ ...prev, organizationId: list[0].id }));
                          handleFieldBlur("organizationId", list[0].id);
                          setPpoAutoFilled(true);
                          setShowManualPpo(false);
                          setMessage({ type: "success", text: `По справочнику определена ППО: ${list[0].name}` });
                          setTimeout(() => setMessage(null), 5000);
                        } else if (list.length > 1) {
                          setPpoAutoFilled(false);
                          setProfileData(prev => ({ ...prev, organizationId: list[0]?.id || null }));
                          if (list[0]?.id) handleFieldBlur("organizationId", list[0].id);
                          setMessage({ type: "success", text: "Выберите ваше ППО из привязанных к месту работы." });
                          setTimeout(() => setMessage(null), 5000);
                        } else {
                          setProfileData(prev => ({ ...prev, organizationId: null }));
                          setPpoAutoFilled(false);
                          setMessage({ type: "error", text: "ППО для данного места работы не найдено. Выберите ППО вручную или отправьте заявку «Моего ППО нет в списке»." });
                          setTimeout(() => setMessage(null), 8000);
                        }
                      }
                    } catch (error) {
                      console.error("Error finding PPO by workplace:", error);
                      setPpoOptionsForWorkplace([]);
                      setPpoAutoFilled(false);
                    }
                  } else {
                    setProfileData(prev => ({
                      ...prev,
                      workplace: "",
                      workplaceInn: "",
                      directorName: "",
                      directorPosition: "",
                      organizationId: null,
                    }));
                    setPpoOptionsForWorkplace([]);
                    setPpoAutoFilled(false);
                  }
                }}
                required
              />
              <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                Поиск по названию или укажите ИНН организации
              </p>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Должность <span className="text-red-500">*</span>
              </label>
              <Autocomplete
                name="jobTitle"
                value={profileData.jobTitle}
                onChange={(value) => {
                  setProfileData(prev => ({ ...prev, jobTitle: value }));
                  if (jobTitles.includes(value)) handleFieldBlur("jobTitle", value);
                }}
                options={jobTitles}
                placeholder="Начните вводить должность..."
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>
          </div>

          {/* Организация профсоюза (ППО) — по справочнику: автоподстановка или выбор из ППО, привязанных к месту работы */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
              Организация профсоюза (ППО) <span className="text-red-500">*</span>
            </label>
            <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
              Членом можно быть только первичной организации (ППО). После выбора места работы ППО подставится по справочнику или можно выбрать из привязанных к вашему месту работы.
            </p>
            {!profileData.workplace?.trim() || !profileData.workplaceInn?.trim() ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                Сначала укажите место работы (с ИНН) — тогда подставится ППО по справочнику или откроется выбор
              </div>
            ) : ppoAutoFilled && profileData.organizationId && ppoOptionsForWorkplace.length === 1 ? (
              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-900/30 dark:text-green-200">
                {ppoOptionsForWorkplace[0]?.name || organizations.find(o => o.id === profileData.organizationId)?.name || profileData.organization?.name || "ППО подставлено по месту работы"}
              </div>
            ) : (
              <>
                <OrganizationAutocomplete
                  value={profileData.organizationId || ""}
                  onChange={(organizationId) => {
                    setProfileData(prev => ({ ...prev, organizationId: organizationId || null }));
                    setPpoAutoFilled(false);
                    if (organizationId) handleFieldBlur("organizationId", organizationId);
                  }}
                  options={
                    ppoOptionsForWorkplace.length > 0
                      ? ppoOptionsForWorkplace.map((p) => ({ id: p.id, name: p.name, fullPath: p.name, indentedName: p.name }))
                      : organizations
                  }
                  placeholder={
                    ppoOptionsForWorkplace.length > 1
                      ? "Выберите ваше ППО из привязанных к месту работы..."
                      : "Выберите ППО из списка или начните вводить название..."
                  }
                />
                <p className="mt-2">
                  <button
                    type="button"
                    onClick={() => setShowManualPpo((v) => !v)}
                    className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
                  >
                    Моего ППО нет в списке
                  </button>
                </p>
                {showManualPpo && (
                  <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                      Укажите название вашей ППО
                    </label>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                      <input
                        type="text"
                        value={manualPpoText}
                        onChange={(e) => setManualPpoText(e.target.value)}
                        placeholder="Например: ППО ГБУЗ Солнечногорской Городской Больницы"
                        className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={handleSendPpoNotInList}
                        disabled={sendingPpoRequest || !manualPpoText.trim()}
                        className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {sendingPpoRequest ? "Отправка..." : "Отправить"}
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      Заявка придёт нам на почту — мы добавим ППО в справочник или свяжемся с вами.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label htmlFor="profile-lastName" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Фамилия <span className="text-red-500">*</span>
              </label>
              <input
                id="profile-lastName"
                type="text"
                name="lastName"
                aria-label="Фамилия"
                value={profileData.lastName}
                onChange={handleNameChange("lastName")}
                onBlur={() => handleFieldBlur("lastName", profileData.lastName)}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                required
              />
            </div>
            <div>
              <label htmlFor="profile-firstName" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Имя <span className="text-red-500">*</span>
              </label>
              <input
                id="profile-firstName"
                type="text"
                name="firstName"
                aria-label="Имя"
                value={profileData.firstName}
                onChange={handleNameChange("firstName")}
                onBlur={() => handleFieldBlur("firstName", profileData.firstName)}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                required
              />
            </div>
            <div>
              <label htmlFor="profile-middleName" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Отчество <span className="font-normal text-gray-500">(необязательно)</span>
              </label>
              <input
                id="profile-middleName"
                type="text"
                name="middleName"
                value={profileData.middleName}
                onChange={handleNameChange("middleName")}
                onBlur={() => handleFieldBlur("middleName", profileData.middleName)}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                placeholder="Например: Петрович"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Дата рождения <span className="text-red-500">*</span>
              </label>
              <DateInput
                name="dateOfBirth"
                value={profileData.dateOfBirth}
                onChange={(e) => {
                  handleProfileChange(e);
                  // Сбрасываем ошибку при изменении
                  setDateOfBirthError(null);
                }}
                onBlur={(e) => {
                  // Проверку «дата в будущем» делает только DateInput по введённому тексту.
                  // Здесь только возраст > 100 и сохранение, чтобы не перезаписывать ошибку устаревшим profileData (гонка при быстром blur).
                  if (profileData.dateOfBirth) {
                    let by = 0, bm = 0, bd = 0;
                    if (profileData.dateOfBirth.includes("-")) {
                      const [y, m, d] = profileData.dateOfBirth.split("-").map(Number);
                      if (y && m && d) { by = y; bm = m; bd = d; }
                    } else if (profileData.dateOfBirth.includes(".")) {
                      const p = profileData.dateOfBirth.split(".").map(Number);
                      if (p.length >= 3) { bd = p[0]; bm = p[1]; by = p[2]; }
                    }
                    const now = new Date();
                    const birthDate = by && bm && bd ? new Date(by, bm - 1, bd) : new Date(profileData.dateOfBirth);
                    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    const ageInYears = !Number.isNaN(birthDate.getTime()) ? (todayStart.getTime() - birthDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25) : 0;
                    
                    if (ageInYears > 100) {
                      setDateOfBirthError("Возраст не может превышать 100 лет");
                      setMessage({ type: "error", text: "Возраст не может превышать 100 лет" });
                    } else {
                      setDateOfBirthError(null);
                      handleFieldBlur("dateOfBirth", profileData.dateOfBirth);
                    }
                  } else {
                    handleFieldBlur("dateOfBirth", profileData.dateOfBirth);
                  }
                }}
                error={dateOfBirthError || undefined}
                maxAge={100}
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
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Предпочтительный город для скидок
                <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">(управляет фильтром скидок)</span>
              </label>
              <div className="mb-3 flex items-center gap-2 rounded-xl border-2 border-blue-200 bg-blue-50/80 px-4 py-3 dark:border-blue-800 dark:bg-blue-900/40">
                <svg className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-blue-600 dark:text-blue-400">Сейчас в предпочтении:</span>
                  <p className="mt-0.5 text-base font-semibold text-blue-900 dark:text-blue-100">
                    {profileData.preferredDiscountCity?.trim() || "Город не указан"}
                  </p>
                  {!profileData.preferredDiscountCity?.trim() && (
                    <p className="mt-1 text-xs text-blue-700/80 dark:text-blue-300/80">
                      В разделе «Скидки» можно выбрать любой город в фильтре.
                    </p>
                  )}
                </div>
              </div>
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
              <label htmlFor="profile-employmentStatus" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">Занятость</label>
              <div className="relative">
                <select
                  id="profile-employmentStatus"
                  name="employmentStatus"
                  aria-label="Занятость"
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
              <label htmlFor="profile-maritalStatus" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">Семейное положение</label>
              <div className="relative">
              <select
                id="profile-maritalStatus"
                name="maritalStatus"
                aria-label="Семейное положение"
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
                            <label htmlFor={`child-gender-${index}`} className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                              Пол
                            </label>
                            <div className="relative">
                              <select
                                id={`child-gender-${index}`}
                                aria-label="Пол ребёнка"
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
                            <label htmlFor={`child-birthDate-${index}`} className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                              Дата рождения
                            </label>
                            <input
                              id={`child-birthDate-${index}`}
                              type="date"
                              aria-label="Дата рождения ребёнка"
                              min="1900-01-01"
                              max={new Date().toISOString().split('T')[0]}
                              value={child.birthDate}
                              onChange={(e) => updateChild(index, "birthDate", e.target.value)}
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
                        <label htmlFor="new-education-level" className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                          Уровень образования <span className="text-red-500">*</span>
                        </label>
                        <select
                          id="new-education-level"
                          aria-label="Уровень образования"
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
                    <button
                      type="button"
                      onClick={openEditJoinedDateModal}
                      className="rounded border border-gray-300 bg-white px-2 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      Изменить дату
                    </button>
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

            {/* Модалка редактирования своей даты вступления */}
            <Modal
              isOpen={showEditJoinedDateModal}
              onClose={() => setShowEditJoinedDateModal(false)}
              className="max-w-md"
            >
              <ModalHeader>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  Редактировать дату вступления
                </h2>
              </ModalHeader>
              <ModalBody>
                <div className="mb-4">
                  <label htmlFor="profile-edit-joined-date" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Дата вступления
                  </label>
                  <input
                    id="profile-edit-joined-date"
                    type="date"
                    min="1900-01-01"
                    max={new Date().toISOString().split("T")[0]}
                    value={editJoinedDateValue}
                    onChange={(e) => setEditJoinedDateValue(e.target.value)}
                    className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-gray-900 shadow-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                  После сохранения потребуется перегенерировать заявления (дата вступления в них изменится).
                </div>
              </ModalBody>
              <ModalFooter className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveJoinedDate}
                  disabled={isSavingJoinedDate || !editJoinedDateValue}
                  className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-white font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  {isSavingJoinedDate ? "Сохранение..." : "Сохранить"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowEditJoinedDateModal(false)}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
                >
                  Отмена
                </button>
              </ModalFooter>
            </Modal>

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
                    <span className="inline-flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Организация не привязана к справочнику. Пожалуйста, обновите профиль и выберите организацию из списка.</span>
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
                  <span className="inline-flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5 shrink-0 inline" /> Организация не указана. Пожалуйста, заполните анкету и выберите организацию из списка.</span>
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
                    <label htmlFor="new-award-type" className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                      Тип награды <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="new-award-type"
                      aria-label="Тип награды"
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

                <div>
                  <label htmlFor="profile-award-attachment-input" className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Файлы / картинки
                  </label>
                  <input
                    id="profile-award-attachment-input"
                    ref={awardFileInputRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,image/*,application/pdf"
                    onChange={handleAwardFileSelect}
                    disabled={uploadingAwardFile}
                    aria-label="Загрузить файл или картинку к награде"
                    className="block w-full text-sm text-gray-500 file:mr-2 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900/20 dark:file:text-blue-300"
                  />
                  {uploadingAwardFile && <p className="mt-1 text-xs text-gray-500">Загрузка...</p>}
                  {(newAward.attachments?.length ?? 0) > 0 && (
                    <ul className="mt-2 space-y-1">
                      {newAward.attachments?.map((att, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm">
                          {att.mimeType?.startsWith("image/") ? (
                            <a href={att.url.startsWith("http") ? att.url : att.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-blue-600 hover:underline">
                              <img src={att.url.startsWith("http") ? att.url : att.url} alt="" className="h-8 w-8 rounded object-cover" />
                              <span className="truncate">{att.fileName}</span>
                            </a>
                          ) : (
                            <a href={att.url.startsWith("http") ? att.url : att.url} target="_blank" rel="noopener noreferrer" className="truncate text-blue-600 hover:underline">{att.fileName}</a>
                          )}
                          <button type="button" onClick={() => removeAwardAttachment(i)} className="rounded p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" title="Удалить">×</button>
                        </li>
                      ))}
                    </ul>
                  )}
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
                      {(award.attachments?.length ?? 0) > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {award.attachments?.map((att, j) => (
                            att.mimeType?.startsWith("image/") ? (
                              <a key={j} href={att.url.startsWith("http") ? att.url : att.url} target="_blank" rel="noopener noreferrer" className="inline-block">
                                <img src={att.url.startsWith("http") ? att.url : att.url} alt={att.fileName} className="h-12 w-12 rounded border border-gray-200 object-cover dark:border-gray-600" />
                              </a>
                            ) : (
                              <a key={j} href={att.url.startsWith("http") ? att.url : att.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">{att.fileName}</a>
                            )
                          ))}
                        </div>
                      )}
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
