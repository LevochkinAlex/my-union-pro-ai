import { getChildOrganizationIds, getOrgHead } from "@/lib/ppo-head-utils";

export type OrgHeadScope = {
  organizationIds: string[];
  level: "PPO" | "MPO" | "RPO";
  organizationId: string;
};

export async function getOrgHeadScope(userId: string): Promise<OrgHeadScope | null> {
  const orgHead = await getOrgHead(userId);
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
