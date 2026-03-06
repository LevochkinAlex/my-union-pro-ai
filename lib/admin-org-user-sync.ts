import { PrismaClient } from "@prisma/client";

/**
 * Единая синхронизация организационных полей пользователя-председателя.
 * Используем в админских сценариях назначения председателя, чтобы
 * organization/workplace не расходились с организацией, где он председатель.
 */
export async function syncChairmanOrganizationFields(
  prisma: PrismaClient,
  userId: string,
  organizationId: string
) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      inn: true,
    },
  });

  if (!org) {
    throw new Error(`Organization not found: ${organizationId}`);
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      organizationId: org.id,
      organizationName: org.name,
      workplace: org.name,
      workplaceInn: org.inn ?? null,
    },
  });
}

