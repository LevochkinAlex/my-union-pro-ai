type OrgRef = { id: string; name: string; inn?: string | null } | null | undefined;

type UserOrgShape = {
  organization?: OrgRef;
  ppoHeadOrganization?: OrgRef;
  mpoHeadOrganization?: OrgRef;
  rpoHeadOrganization?: OrgRef;
  workplace?: string | null;
  workplaceInn?: string | null;
};

/**
 * Единая логика: какая организация считается "основной" для отображения.
 * Приоритет: председательская связь > членская организация.
 */
export function resolveEffectiveOrganization(user: UserOrgShape): OrgRef {
  return (
    user.ppoHeadOrganization ??
    user.mpoHeadOrganization ??
    user.rpoHeadOrganization ??
    user.organization ??
    null
  );
}

/**
 * Единая логика отображения места работы:
 * если есть явный workplace — используем его,
 * иначе подставляем effective organization.
 */
export function resolveEffectiveWorkplace(user: UserOrgShape): string | null {
  const workplace = user.workplace?.trim();
  if (workplace) return workplace;
  return resolveEffectiveOrganization(user)?.name ?? null;
}

/**
 * Единая логика ИНН работодателя:
 * приоритет явного user.workplaceInn, затем ИНН effective organization.
 */
export function resolveEffectiveWorkplaceInn(user: UserOrgShape): string | null {
  const workplaceInn = user.workplaceInn?.trim();
  if (workplaceInn) return workplaceInn;
  return resolveEffectiveOrganization(user)?.inn ?? null;
}

