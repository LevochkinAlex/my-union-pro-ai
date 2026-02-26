import { getChildOrganizationIds, getOrgHead, type OrgHeadData } from "@/lib/ppo-head-utils";

export type OrgHeadScope = {
  organizationIds: string[];
  level: "PPO" | "MPO" | "RPO";
  organizationId: string;
};

/**
 * Возвращает scope руководителя. Если передан orgHead — повторный getOrgHead не вызывается.
 */
export async function getOrgHeadScope(
  userId: string,
  existingOrgHead?: OrgHeadData | null
): Promise<OrgHeadScope | null> {
  const orgHead = existingOrgHead ?? (await getOrgHead(userId));
  if (!orgHead) return null;

  if (orgHead.level === "PPO") {
    return {
      organizationIds: [orgHead.organizationId],
      level: orgHead.level,
      organizationId: orgHead.organizationId,
    };
  }

  const childIds = await getChildOrganizationIds(orgHead.organizationId);
  return {
    organizationIds: [orgHead.organizationId, ...childIds],
    level: orgHead.level,
    organizationId: orgHead.organizationId,
  };
}

export function canAssignHeadByOrganizationType(organizationType: "PRIMARY" | "LOCAL" | "REGIONAL" | "FEDERAL") {
  if (organizationType === "PRIMARY") return "PPO_HEAD";
  if (organizationType === "LOCAL") return "MPO_HEAD";
  if (organizationType === "REGIONAL") return "RPO_HEAD";
  return null;
}
