/**
 * POST /api/landing/request-pricing
 * Заявка «Узнать цены» с лендинга для организаций — отправка на sales@yappix.ru
 */

import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";

const SALES_EMAIL = "sales@yappix.ru";

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      email,
      phone,
      organization,
      message,
    } = body as {
      name?: string;
      email?: string;
      phone?: string;
      organization?: string;
      message?: string;
    };

    if (!name?.trim()) {
      return NextResponse.json(
        { error: "Укажите имя" },
        { status: 400 }
      );
    }
    if (!email?.trim()) {
      return NextResponse.json(
        { error: "Укажите email" },
        { status: 400 }
      );
    }
    if (!phone?.trim()) {
      return NextResponse.json(
        { error: "Укажите телефон" },
        { status: 400 }
      );
    }

    const subject = `[MyUnion Pro] Заявка «Узнать цены» от ${String(name).trim().slice(0, 50)}`;
    const text = [
      "Заявка с лендинга «Узнать цены» (для организаций).",
      "",
      "Имя: " + name.trim(),
      "Email: " + email.trim(),
      "Телефон: " + phone.trim(),
      organization?.trim() ? "Организация: " + organization.trim() : "",
      message?.trim() ? "Сообщение:\n" + message.trim() : "",
    ]
      .filter(Boolean)
      .join("\n");

    const html = [
      "<h2>Заявка «Узнать цены»</h2>",
      "<p>Заявка с лендинга для организаций (MyUnion Pro).</p>",
      "<ul>",
      "<li><strong>Имя:</strong> " + escapeHtml(name.trim()) + "</li>",
      "<li><strong>Email:</strong> " + escapeHtml(email.trim()) + "</li>",
      "<li><strong>Телефон:</strong> " + escapeHtml(phone.trim()) + "</li>",
      organization?.trim()
        ? "<li><strong>Организация:</strong> " + escapeHtml(organization.trim()) + "</li>"
        : "",
      "</ul>",
      message?.trim()
        ? "<p><strong>Сообщение:</strong></p><p>" + escapeHtml(message.trim()) + "</p>"
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    await sendEmail({
      to: SALES_EMAIL,
      subject,
      html,
      text,
    });

    return NextResponse.json({
      success: true,
      message: "Заявка отправлена. Мы свяжемся с вами в ближайшее время.",
    });
  } catch (error) {
    console.error("[landing/request-pricing] Error:", error);
    return NextResponse.json(
      { error: "Ошибка при отправке заявки. Попробуйте позже." },
      { status: 500 }
    );
  }
}
