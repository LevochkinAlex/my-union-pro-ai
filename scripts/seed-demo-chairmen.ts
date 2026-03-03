/**
 * Назначает председателей и настраивает демо для уже существующих ППО.
 * Председатели также являются валидированными членами своей ППО: доступны 2 режима — Председатель и Участник; оба кабинета активны.
 * Запуск: pnpm seed:demo-chairmen
 *
 * 1. ГБУЗ МО "МОССМП" — председатель Сульдин Алексей Михайлович, демо 7 дней, лимит 2 пользователя
 * 2. ГБУЗ МО "Воскресенская больница" — председатель Дренина Елена Александровна, демо 7 дней, лимит 1 пользователь
 */

import { OrganizationType } from "@prisma/client";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getOrCreateOrgSubscription } from "@/lib/subscription";
import { createDefaultChannelForOrganization } from "@/lib/channel-utils";
import { createBestBenefitsUser } from "@/lib/best-benefits-users";
import { encryptPassword } from "@/lib/best-benefits-password";
import { sendEmail } from "@/lib/email";

const REGIONAL_ORG_NAME =
  "Московская областная организация профсоюза работников здравоохранения РФ";

const DEMO_DAYS = 7;

const DATA: Array<{
  orgName: string;
  chairman: {
    lastName: string;
    firstName: string;
    middleName?: string;
    email: string;
    phone: string;
    jobTitle?: string;
  };
  memberLimit: number;
}> = [
  {
    orgName: 'ГБУЗ МО "МОССМП"',
    chairman: {
      lastName: "Сульдин",
      firstName: "Алексей",
      middleName: "Михайлович",
      email: "alek-suldin@yandex.ru",
      phone: "+79167312418",
      jobTitle: "Председатель ППО",
    },
    memberLimit: 2,
  },
  {
    orgName: 'ГБУЗ МО "Воскресенская больница"',
    chairman: {
      lastName: "Дренина",
      firstName: "Елена",
      middleName: "Александровна",
      email: "alena.drenina@yandex.ru",
      phone: "+79150379963",
      jobTitle: "Председатель ППО",
    },
    memberLimit: 1,
  },
];

async function sendChairmanInviteEmail(
  email: string,
  firstName: string,
  lastName: string,
  organizationName: string,
  inviteUrl: string
) {
  const fullName = `${firstName} ${lastName}`;
  await sendEmail({
    to: email,
    subject: `Приглашение в МойСоюз — Председатель ${organizationName}`,
    html: `
      <p>Здравствуйте, ${fullName}!</p>
      <p>Вы назначены Председателем первичной профсоюзной организации <strong>${organizationName}</strong>.</p>
      <p>Завершите регистрацию по ссылке (действует 7 дней):</p>
      <p><a href="${inviteUrl}">Завершить регистрацию</a></p>
      <p>Ссылка: ${inviteUrl}</p>
      <p>—<br>МойСоюз</p>
    `,
    text: `Здравствуйте, ${fullName}! Вы назначены Председателем ППО ${organizationName}. Завершите регистрацию: ${inviteUrl}. МойСоюз`,
  });
}

async function main() {
  console.log("Поиск региональной организации...");
  const regional = await prisma.organization.findFirst({
    where: { name: REGIONAL_ORG_NAME, type: OrganizationType.REGIONAL },
  });
  if (!regional) {
    throw new Error(
      `Региональная организация не найдена: ${REGIONAL_ORG_NAME}. Запустите seed организаций.`
    );
  }
  console.log("Региональная организация:", regional.name);

  const baseUrl = process.env.NEXTAUTH_URL || "https://myunion.pro";

  for (const item of DATA) {
    const { orgName, chairman, memberLimit } = item;
    const { lastName, firstName, middleName, email, phone, jobTitle } = chairman;
    const chairmanName = [lastName, firstName, middleName].filter(Boolean).join(" ");

    console.log("\n---", orgName, "---");

    const org = await prisma.organization.findFirst({
      where: { name: orgName, type: OrganizationType.PRIMARY },
    });
    if (!org) {
      console.warn(`ППО не найдена в системе: "${orgName}". Пропуск.`);
      continue;
    }
    await prisma.organization.update({
      where: { id: org.id },
      data: {
        chairmanName,
        chairmanJobTitle: jobTitle || null,
        ...(org.parentId !== regional.id && {
          parentId: regional.id,
          fullPath: `${regional.fullPath || regional.name} / ${orgName}`,
        }),
      },
    });
    console.log("ППО:", org.name);

    const sub = await getOrCreateOrgSubscription(org.id);
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + DEMO_DAYS);
    await prisma.organizationSubscription.update({
      where: { id: sub.id },
      data: {
        status: "TRIAL",
        trialEndsAt,
        memberLimit,
        manualOverride: true,
        adminNote: `Демо на ${DEMO_DAYS} дней, до ${memberLimit} участников`,
      },
    });
    console.log("Подписка: TRIAL до", trialEndsAt.toISOString().slice(0, 10), ", лимит", memberLimit);

    let user = await prisma.user.findUnique({ where: { email } });
    const inviteToken = crypto.randomBytes(32).toString("hex");
    const inviteTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    if (!user) {
      const generatedPassword = crypto.randomBytes(12).toString("base64").slice(0, 12);
      const hashedPassword = await bcrypt.hash(generatedPassword, 10);
      const encryptedBbPassword = encryptPassword(generatedPassword);

      user = await prisma.user.create({
        data: {
          email,
          phone,
          password: hashedPassword,
          firstName,
          lastName,
          middleName: middleName || null,
          jobTitle: jobTitle || null,
          organizationId: org.id,
          role: "PPO_HEAD",
          isPPOHead: true,
          ppoHeadOrganizationId: org.id,
          viewMode: "PPO_HEAD",
          membershipStatus: "APPROVED",
          unionMembershipStatus: "ACCEPTED",
          membershipJoinedAt: new Date(),
          subscriptionBlockedAt: null,
          emailVerified: null,
          resetToken: inviteToken,
          resetTokenExpires: inviteTokenExpires,
          bestBenefitsPassword: encryptedBbPassword,
        },
      });
      console.log("Создан пользователь (председатель):", email);

      await createDefaultChannelForOrganization(org.id, user.id);

      try {
        const fullName = [lastName, firstName, middleName].filter(Boolean).join(" ");
        const bbUser = await createBestBenefitsUser({
          name: fullName,
          email,
          password: generatedPassword,
          city_id: null,
        });
        const bbUserId = bbUser.data?.id;
        if (bbUserId) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              bestBenefitsUserId: String(bbUserId),
              bestBenefitsStatus: "active",
              bestBenefitsCreatedAt: new Date(),
            },
          });
          console.log("BestBenefits: создан пользователь", bbUserId);
        }
      } catch (e) {
        console.warn("BestBenefits не создан (возможен отключённый API):", (e as Error).message);
      }

      const inviteUrl = `${baseUrl}/auth/invite?token=${inviteToken}`;
      await sendChairmanInviteEmail(email, firstName, lastName, org.name, inviteUrl);
      console.log("Письмо с приглашением отправлено на", email);
    } else {
      if (user.ppoHeadOrganizationId && user.ppoHeadOrganizationId !== org.id) {
        console.warn("Пользователь уже председатель другой ППО, пропуск назначения.");
        continue;
      }
      if (user.ppoHeadOrganizationId === org.id) {
        console.log("Пользователь уже председатель этой ППО.");
        continue;
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          phone,
          firstName,
          lastName,
          middleName: middleName || null,
          jobTitle: jobTitle || null,
          organizationId: org.id,
          role: "PPO_HEAD",
          isPPOHead: true,
          ppoHeadOrganizationId: org.id,
          viewMode: "PPO_HEAD",
          membershipStatus: "APPROVED",
          unionMembershipStatus: "ACCEPTED",
          membershipJoinedAt: user.membershipJoinedAt ?? new Date(),
          subscriptionBlockedAt: null,
          resetToken: inviteToken,
          resetTokenExpires: inviteTokenExpires,
        },
      });
      const existingChannel = await prisma.newsChannel.findFirst({
        where: { organizationId: org.id, isMain: true },
      });
      if (!existingChannel) {
        await createDefaultChannelForOrganization(org.id, user.id);
      }
      const inviteUrl = `${baseUrl}/auth/invite?token=${inviteToken}`;
      await sendChairmanInviteEmail(email, firstName, lastName, org.name, inviteUrl);
      console.log("Существующему пользователю назначены права председателя, письмо отправлено на", email);
    }
  }

  console.log("\nГотово. Обе ППО входят в региональную организацию и отображаются у регионального председателя.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
