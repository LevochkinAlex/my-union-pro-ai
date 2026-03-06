export function isRpoRoleTemplatesEnabled(): boolean {
  return process.env.RPO_ROLE_TEMPLATES_ENABLED === "true";
}

