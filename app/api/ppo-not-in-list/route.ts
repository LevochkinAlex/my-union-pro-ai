/**
 * POST /api/ppo-not-in-list
 * Пользователь не нашёл своё ППО в списке — отправляем заявку на почту администраторам.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const { customPpoName } = body as { customPpoName?: string };

    if (!customPpoName || typeof customPpoName !== "string" || !customPpoName.trim()) {
      return NextResponse.json(
        { error: "Укажите название вашей организации профсоюза (ППО)" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        email: true,
        phone: true,
        workplace: true,
        workplaceInn: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    const adminEmail = process.env.PPO_REQUEST_EMAIL || process.env.ADMIN_EMAIL || process.env.SMTP_USER;
    if (!adminEmail) {
      console.warn("[ppo-not-in-list] PPO_REQUEST_EMAIL / ADMIN_EMAIL / SMTP_USER не заданы, логируем заявку");
    }

    const fullName = [user.lastName, user.firstName, user.middleName].filter(Boolean).join(" ");
    const subject = `[МойСоюз] ППО не в списке: ${customPpoName.trim().slice(0, 50)}`;
    const text = [
      "Пользователь не нашёл своё ППО в списке и отправил заявку.",
      "",
      "Указанное пользователем ППО: " + customPpoName.trim(),
      "",
      "Данные пользователя:",
      "  ФИО: " + (fullName || "—"),
      "  Email: " + (user.email || "—"),
      "  Телефон: " + (user.phone || "—"),
      "  Место работы: " + (user.workplace || "—"),
      "  ИНН места работы: " + (user.workplaceInn || "—"),
      "",
      "Необходимо добавить ППО в справочник или связать место работы с существующим ППО в супер-админке.",
    ].join("\n");

    const html = `
      <h2>ППО не в списке</h2>
      <p>Пользователь не нашёл своё ППО в списке и отправил заявку.</p>
      <p><strong>Указанное пользователем ППО:</strong> ${escapeHtml(customPpoName.trim())}</p>
      <h3>Данные пользователя</h3>
      <ul>
        <li>ФИО: ${escapeHtml(fullName || "—")}</li>
        <li>Email: ${escapeHtml(user.email || "—")}</li>
        <li>Телефон: ${escapeHtml(user.phone || "—")}</li>
        <li>Место работы: ${escapeHtml(user.workplace || "—")}</li>
        <li>ИНН места работы: ${escapeHtml(user.workplaceInn || "—")}</li>
      </ul>
      <p>Необходимо добавить ППО в справочник или связать место работы с существующим ППО в супер-админке.</p>
    `;

    if (adminEmail) {
      await sendEmail({
        to: adminEmail,
        subject,
        html,
        text,
      });
    } else {
      console.log("[ppo-not-in-list] Заявка (email не настроен):", { subject, text });
    }

    return NextResponse.json({
      success: true,
      message: "Заявка отправлена. Мы свяжемся с вами после добавления ППО в справочник.",
    });
  } catch (error) {
    console.error("[ppo-not-in-list] Error:", error);
    return NextResponse.json(
      { error: "Ошибка при отправке заявки. Попробуйте позже." },
      { status: 500 }
    );
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
