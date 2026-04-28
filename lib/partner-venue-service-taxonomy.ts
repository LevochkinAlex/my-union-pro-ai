/** Справочник категорий услуг и услуг для площадки партнёра (кабинет). */

export type PartnerVenueServiceItem = { id: string; label: string };
export type PartnerVenueServiceCategory = {
  id: string;
  label: string;
  services: PartnerVenueServiceItem[];
};

export const PARTNER_VENUE_SERVICE_CATEGORIES: PartnerVenueServiceCategory[] = [
  {
    id: "repair_construction",
    label: "Ремонт и строительство",
    services: [
      { id: "repair_apartments", label: "Ремонт квартир" },
      { id: "repair_electric", label: "Электрика" },
      { id: "repair_plumbing", label: "Сантехника" },
      { id: "repair_house_build", label: "Строительство домов" },
      { id: "repair_interior_design", label: "Дизайн интерьеров" },
      { id: "repair_custom_furniture", label: "Мебель на заказ" },
    ],
  },
  {
    id: "household",
    label: "Бытовые услуги",
    services: [
      { id: "hh_cleaning", label: "Уборка" },
      { id: "hh_dry_cleaning", label: "Химчистка" },
      { id: "hh_appliance_repair", label: "Ремонт техники" },
      { id: "hh_handyman", label: "Услуги мастера на час" },
      { id: "hh_garment_care", label: "Уход за одеждой" },
    ],
  },
  {
    id: "beauty_health",
    label: "Красота и здоровье",
    services: [
      { id: "bh_hair", label: "Парикмахерские услуги" },
      { id: "bh_cosmetology", label: "Косметология" },
      { id: "bh_massage", label: "Массаж" },
      { id: "bh_fitness_trainer", label: "Фитнес-тренеры" },
      { id: "bh_nutritionist", label: "Диетологи" },
    ],
  },
  {
    id: "education",
    label: "Образование и обучение",
    services: [
      { id: "edu_tutoring", label: "Репетиторы" },
      { id: "edu_online_courses", label: "Онлайн-курсы" },
      { id: "edu_languages", label: "Языковые занятия" },
      { id: "edu_training_coaching", label: "Тренинги и коучинг" },
      { id: "edu_exam_prep", label: "Подготовка к экзаменам" },
    ],
  },
  {
    id: "pets",
    label: "Услуги для животных",
    services: [
      { id: "pets_vet", label: "Ветеринары" },
      { id: "pets_grooming", label: "Груминг" },
      { id: "pets_boarding", label: "Передержка" },
      { id: "pets_training", label: "Дрессировка" },
    ],
  },
  {
    id: "creative_hobby",
    label: "Творчество и хобби",
    services: [
      { id: "cr_masterclass", label: "Мастер-классы (рисование, керамика, рукоделие)" },
      { id: "cr_music", label: "Музыкальные занятия (гитара, вокал, диджеинг)" },
      { id: "cr_dance", label: "Танцы" },
      { id: "cr_acting", label: "Актёрское мастерство" },
    ],
  },
  {
    id: "active_leisure",
    label: "Активный отдых",
    services: [
      { id: "act_personal_training", label: "Персональные тренировки" },
      { id: "act_fitness", label: "Фитнес" },
      { id: "act_yoga_meditation", label: "Йога и медитация" },
      { id: "act_extreme", label: "Экстремальные развлечения (скалолазание, парашюты)" },
      { id: "act_guide_walks", label: "Прогулки с гидом" },
      { id: "act_bike_tours", label: "Велотуры" },
    ],
  },
  {
    id: "entertainment",
    label: "Развлечения",
    services: [
      { id: "ent_quests", label: "Квесты" },
      { id: "ent_board_games", label: "Настольные игры с ведущим" },
      { id: "ent_vr", label: "VR-игры" },
      { id: "ent_parties", label: "Организация вечеринок" },
    ],
  },
  {
    id: "culinary",
    label: "Кулинария",
    services: [
      { id: "cul_masterclass", label: "Кулинарные мастер-классы" },
      { id: "cul_tastings", label: "Дегустации (вино, кофе и т.д.)" },
      { id: "cul_private_chef", label: "Услуги личного шеф-повара" },
    ],
  },
  {
    id: "travel_tours",
    label: "Путешествия и туры",
    services: [
      { id: "tr_excursions", label: "Экскурсии" },
      { id: "tr_guides", label: "Гиды" },
      { id: "tr_trip_org", label: "Организация поездок" },
      { id: "tr_author_tours", label: "Авторские туры" },
    ],
  },
  {
    id: "intellectual",
    label: "Интеллектуальный досуг",
    services: [
      { id: "int_lectures", label: "Лекции" },
      { id: "int_book_clubs", label: "Книжные клубы" },
      { id: "int_discussions", label: "Дискуссионные встречи" },
      { id: "int_quizzes", label: "Квизы" },
    ],
  },
  {
    id: "social",
    label: "Социальный досуг",
    services: [
      { id: "soc_networking", label: "Нетворкинг-мероприятия" },
      { id: "soc_interest_clubs", label: "Клубы по интересам" },
      { id: "soc_speed_dating", label: "Спид-дейтинг" },
      { id: "soc_joint_activities", label: "Совместные активности" },
    ],
  },
  {
    id: "kids_leisure",
    label: "Детский досуг",
    services: [
      { id: "kl_development", label: "Развивающие занятия" },
      { id: "kl_creativity", label: "Творчество" },
      { id: "kl_active_sport", label: "Активности и спорт" },
      { id: "kl_entertainment", label: "Развлечения" },
      { id: "kl_social", label: "Социальные активности" },
    ],
  },
  {
    id: "kids_rest_away",
    label: "Детский отдых (восстановление и время вне дома)",
    services: [
      { id: "kr_camps", label: "Лагери" },
      { id: "kr_countryside_kids", label: "Загородный отдых с детьми" },
      { id: "kr_calm_wellness", label: "Спокойный отдых и wellness" },
      { id: "kr_trips_tours", label: "Поездки и туры" },
      { id: "kr_family_secluded", label: "Уединённый отдых с семьёй" },
    ],
  },
  {
    id: "countryside",
    label: "Отели и загородный отдых",
    services: [
      { id: "cnt_hotels", label: "Отели" },
      { id: "cnt_spa_hotels", label: "СПА-отели" },
      { id: "cnt_cottage_rent", label: "Аренда домов и коттеджей" },
      { id: "cnt_glamping", label: "Глэмпинг и кемпинг" },
      { id: "cnt_recreation_bases", label: "Базы отдыха" },
      { id: "cnt_eco_farms", label: "Эко-отели и фермы" },
    ],
  },
  {
    id: "wellness",
    label: "Оздоровление и wellness",
    services: [
      { id: "spa_procedures", label: "СПА-процедуры" },
      { id: "spa_bath_sauna", label: "Бани и сауны" },
      { id: "spa_massage_programs", label: "Массажные программы" },
      { id: "spa_retreats", label: "Ретриты (йога, детокс)" },
      { id: "wl_detox", label: "Детокс-программы" },
      { id: "wl_yoga_tours", label: "Йога-туры" },
      { id: "wl_meditation_retreats", label: "Медитационные ретриты" },
      { id: "wl_antistress", label: "Антистресс-программы" },
    ],
  },
];

const CATEGORY_IDS = new Set(PARTNER_VENUE_SERVICE_CATEGORIES.map((c) => c.id));

export function getPartnerVenueCategoryById(id: string): PartnerVenueServiceCategory | undefined {
  return PARTNER_VENUE_SERVICE_CATEGORIES.find((c) => c.id === id);
}

/** Подпись категории по коду из кабинета (достаточно выбрать категорию, услугу можно не задавать). */
export function getPartnerVenueCategoryLabel(
  categoryCode: string | null | undefined
): string | null {
  const id = categoryCode?.trim() ?? "";
  if (!id) return null;
  return getPartnerVenueCategoryById(id)?.label ?? null;
}

export function isValidPartnerVenueServicePair(
  categoryCode: string | null | undefined,
  serviceCode: string | null | undefined
): boolean {
  const c = categoryCode?.trim() ?? "";
  const s = serviceCode?.trim() ?? "";
  if (!c && !s) return true;
  if (!c || !s) return false;
  if (!CATEGORY_IDS.has(c)) return false;
  const cat = getPartnerVenueCategoryById(c);
  return !!cat?.services.some((svc) => svc.id === s);
}

export function getPartnerVenueServiceLabels(
  categoryCode: string | null | undefined,
  serviceCode: string | null | undefined
): { category: string; service: string } | null {
  const c = categoryCode?.trim() ?? "";
  const s = serviceCode?.trim() ?? "";
  if (!c || !s) return null;
  const cat = getPartnerVenueCategoryById(c);
  if (!cat) return null;
  const svc = cat.services.find((x) => x.id === s);
  if (!svc) return null;
  return { category: cat.label, service: svc.label };
}

/** Фон плашки услуги по коду категории (каталог карточек). Полные классы — для Tailwind JIT. */
const PARTNER_VENUE_CATEGORY_BADGE_BG: Record<string, string> = {
  repair_construction: "bg-stone-600/90",
  household: "bg-amber-600/90",
  beauty_health: "bg-rose-600/90",
  education: "bg-blue-600/90",
  pets: "bg-orange-600/90",
  creative_hobby: "bg-violet-600/90",
  active_leisure: "bg-emerald-600/90",
  entertainment: "bg-purple-600/90",
  culinary: "bg-red-600/90",
  travel_tours: "bg-cyan-600/90",
  intellectual: "bg-indigo-600/90",
  social: "bg-teal-600/90",
  countryside: "bg-sky-600/90",
  wellness: "bg-green-600/90",
  kids_leisure: "bg-fuchsia-600/90",
  kids_rest_away: "bg-lime-600/90",
};

export function getPartnerVenueCategoryBadgeBg(categoryCode: string | null | undefined): string {
  const key = categoryCode?.trim() ?? "";
  return PARTNER_VENUE_CATEGORY_BADGE_BG[key] ?? "bg-indigo-600/90";
}
