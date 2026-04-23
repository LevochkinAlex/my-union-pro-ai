/**
 * Поиск дубликатов аккаунтов и слияние пользователей.
 * Дубликаты: один телефон или один email у разных пользователей (по нормализованным значениям).
 */

import { PrismaClient } from "@prisma/client";

export interface DuplicateGroup {
  reason: "phone" | "email" | "phone_history";
  value: string;
  users: Array<{
    id: string;
    email: string | null;
    phone: string | null;
    authPhone: string | null;
    firstName: string | null;
    lastName: string | null;
    createdAt: Date;
    _count?: { documents: number; tickets: number };
  }>;
}

/**
 * Найти группы возможных дубликатов:
 * - пользователи с одинаковым телефоном (phone/authPhone) в нормализованном виде;
 * - пользователи с одинаковым email;
 * - пользователи, у которых в PhoneHistory встречается один и тот же номер.
 */
export async function findDuplicateGroups(
  prisma: PrismaClient
): Promise<DuplicateGroup[]> {
  const groups: DuplicateGroup[] = [];
  const seenUserIds = new Set<string>();

  const allUsers = await prisma.user.findMany({
    where: { email: { not: null } },
    select: { id: true, email: true, phone: true, authPhone: true, firstName: true, lastName: true, createdAt: true },
  });

  const byEmail = new Map<string, typeof allUsers>();
  for (const u of allUsers) {
    if (!u.email) continue;
    const e = u.email.trim().toLowerCase();
    if (!byEmail.has(e)) byEmail.set(e, []);
    byEmail.get(e)!.push(u);
  }
  for (const [email, users] of byEmail) {
    if (users.length >= 2) {
      const ids = users.map((x) => x.id);
      if (ids.some((id) => seenUserIds.has(id))) continue;
      const withCount = await prisma.user.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          email: true,
          phone: true,
          authPhone: true,
          firstName: true,
          lastName: true,
          createdAt: true,
          _count: { select: { documents: true, tickets: true } },
        },
      });
      groups.push({ reason: "email", value: email, users: withCount });
      ids.forEach((id) => seenUserIds.add(id));
    }
  }

  const withPhone = await prisma.user.findMany({
    where: {
      OR: [{ phone: { not: null } }, { authPhone: { not: null } }],
    },
    select: { id: true, email: true, phone: true, authPhone: true, firstName: true, lastName: true, createdAt: true },
  });

  const byPhoneNorm = new Map<string, typeof withPhone>();
  for (const u of withPhone) {
    const p = u.phone || u.authPhone;
    if (!p) continue;
    const digits = p.replace(/\D/g, "").slice(-10);
    if (digits.length < 10) continue;
    const key = digits;
    if (!byPhoneNorm.has(key)) byPhoneNorm.set(key, []);
    if (!byPhoneNorm.get(key)!.some((x) => x.id === u.id)) {
      byPhoneNorm.get(key)!.push(u);
    }
  }
  for (const [norm, users] of byPhoneNorm) {
    if (users.length >= 2) {
      const ids = users.map((x) => x.id);
      if (ids.some((id) => seenUserIds.has(id))) continue;
      const withCount = await prisma.user.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          email: true,
          phone: true,
          authPhone: true,
          firstName: true,
          lastName: true,
          createdAt: true,
          _count: { select: { documents: true, tickets: true } },
        },
      });
      groups.push({ reason: "phone", value: "+7" + norm.slice(-10), users: withCount });
      ids.forEach((id) => seenUserIds.add(id));
    }
  }

  const allHistory = await prisma.phoneHistory.findMany({
    select: { phone: true, userId: true },
  });
  const phoneToUserIds = new Map<string, Set<string>>();
  for (const h of allHistory) {
    if (!h.userId) continue;
    if (!phoneToUserIds.has(h.phone)) phoneToUserIds.set(h.phone, new Set());
    phoneToUserIds.get(h.phone)!.add(h.userId);
  }
  for (const [phone, userIds] of phoneToUserIds) {
    const ids = Array.from(userIds);
    if (ids.length < 2 || ids.every((id) => seenUserIds.has(id))) continue;
    const withCount = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        email: true,
        phone: true,
        authPhone: true,
        firstName: true,
        lastName: true,
        createdAt: true,
        _count: { select: { documents: true, tickets: true } },
      },
    });
    if (withCount.length >= 2) {
      groups.push({ reason: "phone_history", value: phone, users: withCount });
      ids.forEach((id) => seenUserIds.add(id));
    }
  }

  return groups;
}

/**
 * Слить аккаунт source в target: все связи source перевести на target, затем удалить source.
 * targetId — кого оставляем, sourceId — кого удаляем.
 */
export async function mergeUsers(
  prisma: PrismaClient,
  targetId: string,
  sourceId: string
): Promise<{ ok: boolean; error?: string }> {
  if (targetId === sourceId) {
    return { ok: false, error: "Нельзя объединить аккаунт с самим собой" };
  }

  const [target, source] = await Promise.all([
    prisma.user.findUnique({
      where: { id: targetId },
      select: {
        firstName: true, lastName: true, middleName: true, email: true, phone: true, authPhone: true,
        address: true, dateOfBirth: true, avatarUrl: true, workplace: true, workplaceInn: true,
        directorName: true, directorPosition: true, jobTitle: true, organizationId: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: sourceId },
      select: {
        firstName: true, lastName: true, middleName: true, email: true, phone: true, authPhone: true,
        address: true, dateOfBirth: true, avatarUrl: true, workplace: true, workplaceInn: true,
        directorName: true, directorPosition: true, jobTitle: true, organizationId: true,
      },
    }),
  ]);
  if (!target) return { ok: false, error: "Аккаунт-приёмник не найден" };
  if (!source) return { ok: false, error: "Аккаунт-источник не найден" };

  await prisma.$transaction(async (tx) => {
    // Дополнить профиль основного аккаунта полями из дубликата (только те, которых нет у target)
    const profilePatch: Record<string, unknown> = {};
    const setIfMissing = (t: string | null | undefined, s: string | null | undefined) => {
      if (s != null && s !== "" && (t == null || t === "")) return s;
      return undefined;
    };
    if (setIfMissing(target.firstName, source.firstName) !== undefined) profilePatch.firstName = source.firstName;
    if (setIfMissing(target.lastName, source.lastName) !== undefined) profilePatch.lastName = source.lastName;
    if (setIfMissing(target.middleName, source.middleName) !== undefined) profilePatch.middleName = source.middleName;
    if (setIfMissing(target.email, source.email) !== undefined) profilePatch.email = source.email;
    if (setIfMissing(target.phone, source.phone ?? source.authPhone) !== undefined)
      profilePatch.phone = source.phone ?? source.authPhone;
    if (setIfMissing(target.address, source.address) !== undefined) profilePatch.address = source.address;
    if (source.dateOfBirth != null && target.dateOfBirth == null) profilePatch.dateOfBirth = source.dateOfBirth;
    if (setIfMissing(target.avatarUrl, source.avatarUrl) !== undefined) profilePatch.avatarUrl = source.avatarUrl;
    if (setIfMissing(target.workplace, source.workplace) !== undefined) profilePatch.workplace = source.workplace;
    if (setIfMissing(target.workplaceInn, source.workplaceInn) !== undefined) profilePatch.workplaceInn = source.workplaceInn;
    if (setIfMissing(target.directorName, source.directorName) !== undefined) profilePatch.directorName = source.directorName;
    if (setIfMissing(target.directorPosition, source.directorPosition) !== undefined) profilePatch.directorPosition = source.directorPosition;
    if (setIfMissing(target.jobTitle, source.jobTitle) !== undefined) profilePatch.jobTitle = source.jobTitle;
    if (setIfMissing(target.organizationId, source.organizationId) !== undefined) profilePatch.organizationId = source.organizationId;
    if (Object.keys(profilePatch).length > 0) {
      await tx.user.update({ where: { id: targetId }, data: profilePatch });
    }

    const tables: Array<{ key: string; field: string }> = [
      { key: "document", field: "userId" },
      { key: "ticket", field: "userId" },
      { key: "ticketComment", field: "userId" },
      { key: "ticketActionLog", field: "userId" },
      { key: "organizationStaff", field: "userId" },
      { key: "membershipHistory", field: "userId" },
      { key: "userNotification", field: "userId" },
      { key: "pushSubscription", field: "userId" },
      { key: "userPost", field: "authorId" },
      { key: "postLike", field: "userId" },
      { key: "postView", field: "userId" },
      { key: "postComment", field: "userId" },
      { key: "meetingParticipant", field: "userId" },
      { key: "documentApproval", field: "userId" },
      { key: "documentStatusHistory", field: "changedById" },
      { key: "knowledgeDocument", field: "uploadedByUserId" },
      { key: "newsPost", field: "authorId" },
      { key: "newsLike", field: "userId" },
      { key: "newsView", field: "userId" },
      { key: "newsComment", field: "userId" },
      { key: "newsPollVote", field: "userId" },
      { key: "newsChannel", field: "createdById" },
      { key: "chat", field: "createdById" },
      { key: "chatParticipant", field: "userId" },
      { key: "chatMessage", field: "senderId" },
      { key: "chatMessageReaction", field: "userId" },
      { key: "chatMessageRead", field: "userId" },
      { key: "meeting", field: "createdById" },
      { key: "meetingAgendaItem", field: "speakerId" },
      { key: "meetingAgendaItem", field: "coSpeakerId" },
      { key: "meetingAgendaVote", field: "userId" },
      { key: "discountPreference", field: "userId" },
      { key: "discountActivation", field: "userId" },
      { key: "discountFavorite", field: "userId" },
    ];

    for (const { key, field } of tables) {
      const m = (tx as any)[key];
      if (!m?.updateMany) continue;
      try {
        await m.updateMany({
          where: { [field]: sourceId },
          data: { [field]: targetId },
        });
      } catch (e) {
        console.warn(`[merge] skip ${key}.${field}:`, e);
      }
    }

    try {
      await (tx as any).systemLog.updateMany({ where: { userId: sourceId }, data: { userId: targetId } });
      await (tx as any).systemLog.updateMany({ where: { resolvedBy: sourceId }, data: { resolvedBy: targetId } });
    } catch (e) {
      console.warn("[merge] skip systemLog:", e);
    }
    try {
      await (tx as any).chatParticipant.updateMany({ where: { invitedById: sourceId }, data: { invitedById: targetId } });
    } catch (e) {
      console.warn("[merge] skip chatParticipant.invitedById:", e);
    }

    await tx.document.updateMany({ where: { assignedToId: sourceId }, data: { assignedToId: null } });
    await tx.document.updateMany({ where: { approvedById: sourceId }, data: { approvedById: null } });
    await tx.document.updateMany({ where: { signedById: sourceId }, data: { signedById: null } });

    await tx.phoneHistory.updateMany({ where: { userId: sourceId }, data: { userId: targetId } });
    await tx.sMSPinCode.updateMany({ where: { userId: sourceId }, data: { userId: targetId } });
    await tx.loginToken.updateMany({ where: { userId: sourceId }, data: { userId: targetId } });
    await tx.emailPinCode.updateMany({ where: { userId: sourceId }, data: { userId: targetId } });

    await tx.userSubscription.updateMany({ where: { subscriberId: sourceId }, data: { subscriberId: targetId } });
    await tx.userSubscription.updateMany({ where: { targetUserId: sourceId }, data: { targetUserId: targetId } });

    await tx.user.update({
      where: { id: sourceId },
      data: {
        email: `merged-${sourceId}@merged.local`,
        phone: null,
        authPhone: null,
        password: null,
        firstName: "Объединён",
        lastName: sourceId.slice(0, 8),
        organizationId: null,
        ppoHeadOrganizationId: null,
        mpoHeadOrganizationId: null,
        rpoHeadOrganizationId: null,
      },
    });
  });

  return { ok: true };
}
