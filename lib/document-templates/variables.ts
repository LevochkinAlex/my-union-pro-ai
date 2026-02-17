/**
 * Переменные шаблонов документов — клиентский модуль (без puppeteer)
 */

export interface TemplateVariables {
  firstName?: string;
  lastName?: string;
  middleName?: string;
  fullName?: string;
  fullNameGenitive?: string;
  phone?: string;
  email?: string;
  address?: string;
  jobTitle?: string;
  profession?: string;
  education?: string;
  organizationName?: string;
  organizationInn?: string;
  organizationChairmanName?: string;
  organizationChairmanJobTitle?: string;
  organizationChairmanFullName?: string;
  /** ФИО председателя в дательном падеже (Председателю кому? — Иванову Андрею Степановичу) */
  organizationChairmanNameDative?: string;
  workplace?: string;
  workplaceInn?: string;
  directorName?: string;
  directorPosition?: string;
  dateOfBirth?: string;
  currentDate?: string;
  meetingDate?: string;
  meetingTime?: string;
  meetingPlace?: string;
  agendaItems?: string;
  votingParticipants?: string;
  presentMembers?: string;
  absentMembers?: string;
  secretaryName?: string;
  secretaryJobTitle?: string;
  resolutionNumber?: string;
  protocolNumber?: string;
  [key: string]: string | undefined;
}

export const TEMPLATE_VARIABLES_FOR_EDITOR: { key: keyof TemplateVariables | string; label: string }[] = [
  { key: "firstName", label: "Имя" },
  { key: "lastName", label: "Фамилия" },
  { key: "middleName", label: "Отчество" },
  { key: "fullName", label: "Полное ФИО" },
  { key: "fullNameGenitive", label: "ФИО в родительном падеже" },
  { key: "phone", label: "Телефон" },
  { key: "email", label: "Email" },
  { key: "address", label: "Адрес" },
  { key: "jobTitle", label: "Должность" },
  { key: "profession", label: "Профессия" },
  { key: "education", label: "Образование" },
  { key: "organizationName", label: "Название организации" },
  { key: "organizationInn", label: "ИНН организации" },
  { key: "organizationChairmanName", label: "ФИО председателя организации" },
  { key: "organizationChairmanJobTitle", label: "Должность председателя организации" },
  { key: "organizationChairmanFullName", label: "Полное ФИО председателя с должностью (для шапки «Кому»)" },
  { key: "organizationChairmanNameDative", label: "ФИО председателя в дательном падеже (Председателю кому?)" },
  { key: "workplace", label: "Место работы (компания)" },
  { key: "workplaceInn", label: "ИНН места работы" },
  { key: "directorName", label: "ФИО руководителя с места работы" },
  { key: "directorPosition", label: "Должность руководителя с места работы" },
  { key: "dateOfBirth", label: "Дата рождения (ДД.ММ.ГГГГ)" },
  { key: "currentDate", label: "Текущая дата (ДД.ММ.ГГГГ)" },
  { key: "meetingDate", label: "Дата заседания (ДД.ММ.ГГГГ)" },
  { key: "meetingTime", label: "Время заседания (ЧЧ:ММ)" },
  { key: "meetingPlace", label: "Место проведения заседания" },
  { key: "agendaItems", label: "Пункты повестки дня (список)" },
  { key: "votingParticipants", label: "Участники голосования (список ФИО и должностей)" },
  { key: "presentMembers", label: "Присутствующие члены профкома (список)" },
  { key: "absentMembers", label: "Отсутствующие члены профкома (список)" },
  { key: "secretaryName", label: "ФИО секретаря" },
  { key: "secretaryJobTitle", label: "Должность секретаря" },
  { key: "resolutionNumber", label: "Номер постановления" },
  { key: "protocolNumber", label: "Номер протокола" },
];
