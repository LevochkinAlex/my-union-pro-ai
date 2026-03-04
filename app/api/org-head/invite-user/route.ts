import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHeadScope } from "@/lib/org-head-permissions";
import crypto from "crypto";
import { sendEmail } from "@/lib/email";
import { createDefaultChannelForOrganization } from "@/lib/channel-utils";
import { normalizePhone } from "@/lib/utils/phone";

type Body = {
  email: string;
  phone?: string | null;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  jobTitle?: string | null;
  organizationId: string;
  isChairman: boolean;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * POST /api/org-head/invite-user
 * Добавление пользователя региональным руководителем: приглашение участника или председателя ППО.
 * - isChairman: true — председатель ППО (автовалидация, кабинет ППО + участника), письмо с инструкцией.
 * - isChairman: false — обычный участник с привязкой к организации, приглашение заполнить профиль.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const scope = await getOrgHeadScope(session.user.id);
    if (!scope || !scope.organizationIds.length) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as Body;
    const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
    const phone = typeof body.phone === "string" ? normalizePhone(body.phone) || null : null;
    const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
    const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
    const middleName = typeof body.middleName === "string" ? body.middleName.trim() || null : null;
    const jobTitle = typeof body.jobTitle === "string" ? body.jobTitle.trim() || null : null;
    const organizationId = typeof body.organizationId === "string" ? body.organizationId.trim() : "";
    const isChairman = body.isChairman === true;

    if (!email || !firstName || !lastName) {
      return NextResponse.json(
        { error: "Укажите email, имя и фамилию" },
        { status: 400 }
      );
    }
    if (!organizationId) {
      return NextResponse.json(
        { error: "Выберите организацию" },
        { status: 400 }
      );
    }
    if (!scope.organizationIds.includes(organizationId)) {
      return NextResponse.json(
        { error: "Нет доступа к выбранной организации" },
        { status: 403 }
      );
    }

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, type: true },
    });
    if (!organization) {
      return NextResponse.json({ error: "Организация не найдена" }, { status: 404 });
    }

    if (isChairman && organization.type !== "PRIMARY") {
      return NextResponse.json(
        { error: "Председатель может быть назначен только для ППО (первичной организации)" },
        { status: 400 }
      );
    }

    const baseUrl = process.env.NEXTAUTH_URL || "https://myunion.pro";
    const inviteToken = crypto.randomBytes(32).toString("hex");
    const inviteTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const inviteUrl = `${baseUrl}/auth/invite?token=${inviteToken}`;

    if (isChairman) {
      // ——— Председатель ППО: автовалидация, кабинет ППО + участника ———
      let user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          emailVerified: true,
          firstName: true,
          lastName: true,
          ppoHeadOrganizationId: true,
          role: true,
        },
      });

      if (user?.ppoHeadOrganizationId === organizationId) {
        return NextResponse.json(
          { error: "Пользователь уже является председателем этой организации" },
          { status: 400 }
        );
      }
      if (user?.ppoHeadOrganizationId && user.ppoHeadOrganizationId !== organizationId) {
        return NextResponse.json(
          { error: "Пользователь уже является председателем другой организации" },
          { status: 400 }
        );
      }

      const chairmanName = [lastName, firstName, middleName].filter(Boolean).join(" ");
      const updateData: Record<string, unknown> = {
        isPPOHead: true,
        ppoHeadOrganizationId: organizationId,
        organizationId: organizationId,
        viewMode: "PPO_HEAD",
        membershipStatus: "APPROVED",
        firstName,
        lastName,
        middleName,
        phone: phone ?? undefined,
        jobTitle: jobTitle ?? undefined,
        resetToken: inviteToken,
        resetTokenExpires: inviteTokenExpires,
      };
      if (user?.role !== "MEMBER" && user?.role !== "PENDING_MEMBER") {
        (updateData as any).role = "PPO_HEAD";
      }

      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: updateData as any,
        });
        user = { id: user.id, firstName, lastName } as { id: string; firstName: string; lastName: string };
      } else {
        user = await prisma.user.create({
          data: {
            email,
            phone,
            firstName,
            lastName,
            middleName,
            jobTitle,
            organizationId: organizationId,
            role: "PPO_HEAD",
            isPPOHead: true,
            ppoHeadOrganizationId: organizationId,
            viewMode: "PPO_HEAD",
            membershipStatus: "APPROVED",
            resetToken: inviteToken,
            resetTokenExpires: inviteTokenExpires,
          },
          select: { id: true, firstName: true, lastName: true },
        });
      }

      await prisma.organization.update({
        where: { id: organizationId },
        data: {
          chairmanName: chairmanName || null,
          chairmanJobTitle: jobTitle || null,
        },
      });

      await createDefaultChannelForOrganization(organizationId, user.id);

      await sendEmail({
        to: email,
        subject: "Приглашение: вы назначены Председателем ППО — МойСоюз",
        html: getChairmanInviteHtml(firstName, lastName, organization.name, inviteUrl),
        text: getChairmanInviteText(firstName, lastName, organization.name, inviteUrl),
      });

      return NextResponse.json({
        success: true,
        message: "Председатель ППО добавлен. На указанный email отправлено приглашение с инструкцией.",
        userId: user.id,
        isChairman: true,
      });
    }

    // ——— Обычный участник: привязка к организации, приглашение заполнить профиль ———
    let member = await prisma.user.findUnique({
      where: { email },
      select: { id: true, emailVerified: true, firstName: true, organizationId: true },
    });

    if (member) {
      if (member.emailVerified) {
        return NextResponse.json(
          { error: "Пользователь с таким email уже зарегистрирован" },
          { status: 400 }
        );
      }
      await prisma.user.update({
        where: { id: member.id },
        data: {
          resetToken: inviteToken,
          resetTokenExpires: inviteTokenExpires,
          organizationId: organizationId,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          middleName: middleName ?? undefined,
          phone: phone ?? undefined,
        },
      });
    } else {
      member = await prisma.user.create({
        data: {
          email,
          phone,
          firstName,
          lastName,
          middleName,
          organizationId: organizationId,
          role: "PENDING_MEMBER",
          membershipStatus: "PROFILE_INCOMPLETE",
          resetToken: inviteToken,
          resetTokenExpires: inviteTokenExpires,
        },
        select: { id: true, firstName: true },
      });
    }

    await sendEmail({
      to: email,
      subject: "Приглашение в МойСоюз",
      html: getMemberInviteHtml(member.firstName || firstName, organization.name, inviteUrl),
      text: getMemberInviteText(member.firstName || firstName, organization.name, inviteUrl),
    });

    return NextResponse.json({
      success: true,
      message: "Приглашение отправлено. Пользователь сможет войти по ссылке и заполнить профиль.",
      userId: member.id,
      isChairman: false,
    });
  } catch (e: any) {
    console.error("[org-head/invite-user] POST error:", e);
    return NextResponse.json(
      {
        error: "Ошибка при добавлении пользователя",
        details: process.env.NODE_ENV === "development" ? e?.message : undefined,
      },
      { status: 500 }
    );
  }
}

function getChairmanInviteHtml(firstName: string, lastName: string, orgName: string, inviteUrl: string): string {
  const fullName = `${firstName} ${lastName}`;
  return `
<p>Здравствуйте, ${fullName}!</p>
<p>Вы назначены <strong>Председателем</strong> первичной профсоюзной организации <strong>${orgName}</strong>.</p>
<p>Вам доступны два кабинета: <strong>кабинет Председателя ППО</strong> (управление документами, заявлениями, новостями) и <strong>кабинет участника</strong>. Вы автоматически являетесь членом профсоюза своей организации.</p>
<p>Перейдите по ссылке, чтобы завершить регистрацию и войти:</p>
<p><a href="${inviteUrl}" style="color: #2563eb;">Завершить регистрацию и войти</a></p>
<p><strong>Что сделать после входа:</strong></p>
<ul>
  <li>Заполните профиль (ФИО, дата рождения, контакты, место работы)</li>
  <li>В кабинете Председателя вы сможете одобрять заявления, проводить заседания, создавать документы</li>
</ul>
<p>Ссылка действительна 7 дней.</p>
<p>—<br>МойСоюз</p>
  `.trim();
}

function getChairmanInviteText(firstName: string, lastName: string, orgName: string, inviteUrl: string): string {
  return `Здравствуйте, ${firstName} ${lastName}! Вы назначены Председателем ППО «${orgName}». Завершите регистрацию: ${inviteUrl}. После входа заполните профиль. Ссылка действительна 7 дней. — МойСоюз`;
}

function getMemberInviteHtml(firstName: string, orgName: string, inviteUrl: string): string {
  return `
<p>Здравствуйте${firstName ? `, ${firstName}` : ""}!</p>
<p>Вас приглашают в платформу <strong>МойСоюз</strong> в организацию <strong>${orgName}</strong>.</p>
<p>Перейдите по ссылке, чтобы завершить регистрацию и войти в личный кабинет:</p>
<p><a href="${inviteUrl}" style="color: #2563eb;">Завершить регистрацию</a></p>
<p>После входа заполните профиль (ФИО, дата рождения, контакты, место работы) — это необходимо для рассмотрения заявления на вступление в профсоюз.</p>
<p>Ссылка действительна 7 дней.</p>
<p>—<br>МойСоюз</p>
  `.trim();
}

function getMemberInviteText(firstName: string, orgName: string, inviteUrl: string): string {
  return `Здравствуйте! Вас приглашают в МойСоюз (${orgName}). Завершите регистрацию: ${inviteUrl}. Заполните профиль после входа. Ссылка действительна 7 дней. — МойСоюз`;
}
