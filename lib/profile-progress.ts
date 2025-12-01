/**
 * Утилита для расчета прогресса заполнения профиля пользователя
 */

interface UserProfile {
  // Основная информация (обязательная для документов)
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  dateOfBirth?: Date | null;
  phone?: string | null;
  address?: string | null;
  jobTitle?: string | null;
  profession?: string | null;
  education?: string | null;
  email?: string | null;
  emailVerified?: Date | null;
  organizationId?: string | null;
  organizationName?: string | null;
  organization?: { id: string; name: string } | null;

  // Дополнительная информация
  avatarUrl?: string | null;
  preferredDiscountCity?: string | null;
  employmentStatus?: string | null;
  hobbies?: string | null;
  aboutMe?: string | null;
  hasChildren?: boolean | null;
  childrenInfo?: string | null;
  childrenBirthDates?: string | null;
  maritalStatus?: string | null;
  spouseInfo?: string | null;
  awards?: string | null;
  training?: string | null;
  additionalInfo?: string | null;
}

interface ProfileProgressResult {
  total: number; // Общий прогресс 0-100
  required: number; // Прогресс обязательных полей 0-100
  optional: number; // Прогресс дополнительных полей 0-100
  requiredFields: {
    filled: number;
    total: number;
  };
  optionalFields: {
    filled: number;
    total: number;
  };
}

/**
 * Рассчитывает прогресс заполнения профиля
 * Обязательные поля имеют больший вес (70%), дополнительные - меньший (30%)
 */
export function calculateProfileProgress(user: UserProfile | null): ProfileProgressResult {
  if (!user) {
    return {
      total: 0,
      required: 0,
      optional: 0,
      requiredFields: { filled: 0, total: 0 },
      optionalFields: { filled: 0, total: 0 },
    };
  }

  // Обязательные поля для генерации документов (вес 70%)
  const requiredFields = [
    { name: "firstName", value: user.firstName },
    { name: "lastName", value: user.lastName },
    { name: "dateOfBirth", value: user.dateOfBirth },
    { name: "phone", value: user.phone },
    { name: "address", value: user.address },
    { name: "jobTitle", value: user.jobTitle },
    { name: "profession", value: user.profession },
    { name: "education", value: user.education },
    { name: "organization", value: user.organizationId || user.organizationName || user.organization?.id },
    { name: "email", value: user.email }, // Email желателен, но не обязателен для документов
  ];

  // Дополнительные поля (вес 30%)
  const optionalFields = [
    { name: "middleName", value: user.middleName },
    { name: "emailVerified", value: user.emailVerified },
    { name: "avatarUrl", value: user.avatarUrl },
    { name: "preferredDiscountCity", value: user.preferredDiscountCity },
    { name: "employmentStatus", value: user.employmentStatus },
    { name: "hobbies", value: user.hobbies },
    { name: "aboutMe", value: user.aboutMe },
    { name: "maritalStatus", value: user.maritalStatus },
    { name: "hasChildren", value: user.hasChildren !== null ? String(user.hasChildren) : null },
    { name: "childrenInfo", value: user.childrenInfo },
    { name: "childrenBirthDates", value: user.childrenBirthDates },
    { name: "spouseInfo", value: user.spouseInfo },
    { name: "awards", value: user.awards },
    { name: "training", value: user.training },
    { name: "additionalInfo", value: user.additionalInfo },
  ];

  // Подсчитываем заполненные обязательные поля
  const filledRequired = requiredFields.filter((field) => {
    if (field.value === null || field.value === undefined) return false;
    if (typeof field.value === "string") return field.value.trim().length > 0;
    if (field.value instanceof Date) return true;
    return Boolean(field.value);
  }).length;

  // Подсчитываем заполненные дополнительные поля
  const filledOptional = optionalFields.filter((field) => {
    if (field.value === null || field.value === undefined) return false;
    if (typeof field.value === "string") return field.value.trim().length > 0;
    return Boolean(field.value);
  }).length;

  // Рассчитываем прогресс
  const requiredProgress = Math.round((filledRequired / requiredFields.length) * 100);
  const optionalProgress = Math.round((filledOptional / optionalFields.length) * 100);

  // Общий прогресс: 70% обязательные + 30% дополнительные
  const totalProgress = Math.round(requiredProgress * 0.7 + optionalProgress * 0.3);

  return {
    total: totalProgress,
    required: requiredProgress,
    optional: optionalProgress,
    requiredFields: {
      filled: filledRequired,
      total: requiredFields.length,
    },
    optionalFields: {
      filled: filledOptional,
      total: optionalFields.length,
    },
  };
}

