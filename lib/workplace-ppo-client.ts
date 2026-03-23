export type WorkplacePpoOption = {
  id: string;
  name: string;
  chairmanName?: string | null;
  chairmanJobTitle?: string | null;
  organizationType?: string;
};

export async function fetchWorkplacePpoOptions(params: {
  workplaceName: string;
  workplaceInn?: string | null;
}): Promise<WorkplacePpoOption[]> {
  const workplaceName = params.workplaceName?.trim() ?? "";
  const workplaceInn = params.workplaceInn?.trim() ?? "";
  if (!workplaceName) return [];

  const query = new URLSearchParams({ workplaceName });
  if (workplaceInn) query.set("workplaceInn", workplaceInn);

  const res = await fetch(`/api/workplace/ppo?${query.toString()}`);
  if (!res.ok) return [];
  const data = await res.json();
  const list = data.ppoOrganizations || (data.ppoOrganization ? [data.ppoOrganization] : []);
  return Array.isArray(list) ? list : [];
}

