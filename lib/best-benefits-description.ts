/**
 * Нормализация текстов скидки из BestBenefits API.
 * На стороне BB поля description / short_description / conditions иногда меняются или дублируются.
 */

type BBProductLike = Record<string, unknown>;

function pickStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

/**
 * Вытаскивает полное и краткое описание из сырого объекта продукта BB.
 */
export function coalesceBestBenefitsDescriptions(bb: BBProductLike): {
  description: string | null;
  shortDescription: string | null;
} {
  const shortRaw = pickStr(bb.short_description);
  const descRaw = pickStr(bb.description);
  const conditions =
    pickStr(bb.conditions) ??
    pickStr(bb.usage_conditions) ??
    pickStr(bb.terms_of_use) ??
    pickStr(bb.terms) ??
    pickStr(bb.instruction) ??
    pickStr(bb.rules);

  let description = descRaw;
  if (conditions) {
    if (!description) {
      description = conditions;
    } else if (!description.includes(conditions.slice(0, Math.min(40, conditions.length)))) {
      description = `${description}\n\n${conditions}`;
    }
  }

  let shortDescription = shortRaw;

  // Частый кейс: в description — короткий маркетинг, условия — в short_description (длинный текст)
  if (
    shortDescription &&
    description &&
    shortDescription.length > 120 &&
    shortDescription.length > description.length + 40
  ) {
    const marketing = description;
    description = shortDescription;
    shortDescription = marketing || null;
  } else if (!description && shortDescription && shortDescription.length > 120) {
    description = shortDescription;
    shortDescription = null;
  }

  return {
    description: description ?? null,
    shortDescription: shortDescription ?? null,
  };
}

/**
 * При ответе API и данных из локальной БД: не затирать полные «Условия» коротким маркетингом с API.
 */
export function mergeDiscountTextWithLocal(
  apiDescription: string | null | undefined,
  apiShort: string | null | undefined,
  localDescription: string | null | undefined,
  localShort: string | null | undefined,
): { description: string | null; shortDescription: string | null } {
  const aDesc = (apiDescription ?? "").trim();
  const lDesc = (localDescription ?? "").trim();
  const aShort = (apiShort ?? "").trim();
  const lShort = (localShort ?? "").trim();

  let description: string | null = null;
  if (!lDesc) description = aDesc || null;
  else if (!aDesc) description = lDesc || null;
  else if (lDesc.length > aDesc.length + 80) description = lDesc;
  else if (aDesc.length > lDesc.length + 80) description = aDesc;
  else description = aDesc.length >= lDesc.length ? aDesc : lDesc;

  const shortDescription =
    aShort || lShort || null;

  return { description, shortDescription };
}
