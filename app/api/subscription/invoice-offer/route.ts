import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSubscriptionOrganizationId } from "@/lib/subscription-org";
import { prisma } from "@/lib/prisma";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import {
  calculateAmountForMemberCountPeriod,
  getPriceForPeriod,
  getRatesForMemberCount,
  getTariffByKey,
  type TariffPeriod,
} from "@/lib/constants/tariffs";

function formatMoney(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function periodLabel(period: TariffPeriod): string {
  if (period === "half_year") return "6 месяцев";
  if (period === "year") return "12 месяцев";
  return period;
}

/**
 * POST /api/subscription/invoice-offer
 * Генерация счет-оферты PDF по выбранному тарифу/периоду и сохраненному платежному профилю
 * Body: { tariffKey?, customMembers?, period }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const organizationId = await getSubscriptionOrganizationId(session.user.id);
    if (!organizationId) {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const tariffKey = String(body?.tariffKey || "").trim();
    const customMembersRaw = body?.customMembers;
    const customMembers =
      typeof customMembersRaw === "number"
        ? customMembersRaw
        : parseInt(String(customMembersRaw ?? ""), 10);
    const period = String(body?.period || "year") as TariffPeriod;
    if (period !== "half_year" && period !== "year") {
      return NextResponse.json({ error: "Доступны только периоды 6 или 12 месяцев" }, { status: 400 });
    }

    let memberLimit: number;
    let tariffLabel: string;
    let ratePerUserPerMonth: number;
    let amountRub: number;

    if (Number.isFinite(customMembers) && customMembers > 0) {
      memberLimit = Math.floor(customMembers);
      const rates = getRatesForMemberCount(memberLimit);
      ratePerUserPerMonth = period === "half_year" ? rates.sixMonthRate : rates.yearRate;
      tariffLabel = `Индивидуальный (${memberLimit} пользователей)`;
      amountRub = calculateAmountForMemberCountPeriod(memberLimit, period);
    } else {
      if (!tariffKey) {
        return NextResponse.json({ error: "Укажите тариф или количество пользователей" }, { status: 400 });
      }
      const tariff = getTariffByKey(tariffKey);
      if (!tariff || tariff.isUnlimited || !tariff.memberLimit) {
        return NextResponse.json({ error: "Некорректный тариф для счета-оферты" }, { status: 400 });
      }
      memberLimit = tariff.memberLimit;
      tariffLabel = tariff.label;
      ratePerUserPerMonth = period === "half_year" ? tariff.pricePerUserPerMonth : tariff.pricePerUserPerYear;
      amountRub = getPriceForPeriod(tariff, period);
    }

    const profile = await prisma.organizationBillingProfile.findUnique({
      where: { organizationId },
    });
    if (!profile) {
      return NextResponse.json(
        { error: "Сначала заполните платежный профиль для счета-оферты" },
        { status: 400 }
      );
    }

    const today = new Date();
    const offerNumber = `MYU-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}-${Math.floor(1000 + Math.random() * 9000)}`;

    const doc = new PDFDocument({
      size: "A4",
      margin: 40,
      info: {
        Title: `Счет-оферта ${offerNumber}`,
        Author: "MyUnion Pro",
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));

    const fontsDir = path.join(process.cwd(), "public", "fonts");
    const robotoRegularPath = path.join(fontsDir, "Roboto-Regular.ttf");
    const robotoBoldPath = path.join(fontsDir, "Roboto-Bold.ttf");
    const hasCustomFonts = fs.existsSync(robotoRegularPath) && fs.existsSync(robotoBoldPath);
    if (hasCustomFonts) {
      doc.registerFont("Roboto", robotoRegularPath);
      doc.registerFont("Roboto-Bold", robotoBoldPath);
      doc.font("Roboto");
    }
    const fontRegular = hasCustomFonts ? "Roboto" : "Helvetica";
    const fontBold = hasCustomFonts ? "Roboto-Bold" : "Helvetica-Bold";

    // Реквизиты поставщика (ЯППИКС)
    const supplierName = "ООО «ЯППИКС»";
    const supplierInn = "9707055804";
    const supplierKpp = "770701001";
    const supplierOgrn = "1267700040684";
    const supplierAddress = "127055, г. Москва, вн.тер.г. МО Тверской, ул. Палиха, д. 7-9, к. 4, пом. 1/1";
    const supplierBank = "АО «Тинькофф Банк»";
    const supplierBik = "044525974";
    const supplierRs = "40702810910002055576";
    const supplierKs = "30101810145250000974";

    // Шапка образца (платежное поручение)
    let x = 40;
    let y = 40;
    doc.font(fontRegular).fontSize(8).text("Образец заполнения платежного поручения", x, y);
    y += 14;
    doc.rect(x, y, 515, 56).stroke();
    doc.font(fontRegular).fontSize(8)
      .text(`ИНН ${supplierInn}`, x + 6, y + 6)
      .text(`КПП ${supplierKpp}`, x + 120, y + 6)
      .text(`Сч. № ${supplierRs}`, x + 360, y + 6, { width: 145, align: "right" })
      .text(`Получатель: ${supplierName}`, x + 6, y + 22, { width: 350 })
      .text(`Банк получателя: ${supplierBank}`, x + 6, y + 36, { width: 320 })
      .text(`БИК ${supplierBik}`, x + 360, y + 22)
      .text(`к/с ${supplierKs}`, x + 360, y + 36);

    y += 70;
    doc.font(fontBold).fontSize(14).text(`Счёт-оферта № ${offerNumber} от ${today.toLocaleDateString("ru-RU")}`, x, y, {
      align: "left",
    });
    y += 24;

    doc.font(fontBold).fontSize(10).text("Поставщик:", x, y);
    doc.font(fontRegular).fontSize(9).text(
      `${supplierName}, ${supplierAddress}, ИНН ${supplierInn}, КПП ${supplierKpp}, ОГРН ${supplierOgrn}, р/с ${supplierRs}, в банке ${supplierBank}, БИК ${supplierBik}, к/с ${supplierKs}`,
      x + 72,
      y,
      { width: 440 }
    );
    y = doc.y + 8;

    const buyerMainName =
      profile.entityType === "INDIVIDUAL"
        ? profile.fullName || "Физическое лицо"
        : profile.companyName || "Организация";
    const buyerInnKpp =
      profile.inn || profile.kpp
        ? `ИНН/КПП ${profile.inn || "—"}/${profile.kpp || "—"}`
        : "";

    doc.font(fontBold).fontSize(10).text("Покупатель:", x, y);
    doc.font(fontRegular).fontSize(9).text(
      [
        buyerMainName,
        buyerInnKpp,
        profile.legalAddress || null,
        profile.checkingAccount ? `р/с ${profile.checkingAccount}` : null,
        profile.bankName ? `${profile.bankName}` : null,
        profile.bik ? `БИК ${profile.bik}` : null,
        profile.correspondentAccount ? `к/с ${profile.correspondentAccount}` : null,
      ].filter(Boolean).join(", "),
      x + 72,
      y,
      { width: 440 }
    );
    y = doc.y + 10;

    // Простая табличная часть
    const col1 = 30;
    const col2 = 280;
    const col3 = 80;
    const col4 = 80;
    const col5 = 90;
    const rowH = 22;

    doc.rect(x, y, col1, rowH).stroke();
    doc.rect(x + col1, y, col2, rowH).stroke();
    doc.rect(x + col1 + col2, y, col3, rowH).stroke();
    doc.rect(x + col1 + col2 + col3, y, col4, rowH).stroke();
    doc.rect(x + col1 + col2 + col3 + col4, y, col5, rowH).stroke();

    doc.font(fontBold).fontSize(9)
      .text("№", x + 8, y + 6)
      .text("Наименование", x + col1 + 6, y + 6)
      .text("Кол-во", x + col1 + col2 + 18, y + 6)
      .text("Цена", x + col1 + col2 + col3 + 20, y + 6)
      .text("Сумма", x + col1 + col2 + col3 + col4 + 18, y + 6);

    y += rowH;
    doc.rect(x, y, col1, rowH).stroke();
    doc.rect(x + col1, y, col2, rowH).stroke();
    doc.rect(x + col1 + col2, y, col3, rowH).stroke();
    doc.rect(x + col1 + col2 + col3, y, col4, rowH).stroke();
    doc.rect(x + col1 + col2 + col3 + col4, y, col5, rowH).stroke();

    const itemName = `Доступ к SaaS «MyUnion Pro», ${tariffLabel}, период ${periodLabel(period)}`;
    doc.font(fontRegular).fontSize(9)
      .text("1", x + 8, y + 6)
      .text(itemName, x + col1 + 6, y + 6, { width: col2 - 12 })
      .text(String(memberLimit), x + col1 + col2 + 28, y + 6)
      .text(`${formatMoney(amountRub)}`, x + col1 + col2 + col3 + 8, y + 6, { width: col4 - 10, align: "right" })
      .text(`${formatMoney(amountRub)}`, x + col1 + col2 + col3 + col4 + 8, y + 6, { width: col5 - 12, align: "right" });

    y += rowH + 10;
    doc.font(fontBold).fontSize(10).text(`Итого к оплате: ${formatMoney(amountRub)} ₽`, x, y);
    y += 18;
    doc.font(fontRegular).fontSize(9).text(`НДС не облагается (УСН). Тарифная ставка: ${ratePerUserPerMonth} ₽/польз./месяц`, x, y);
    y += 24;

    const offerText = [
      "Настоящий счет-оферта (далее — «Счет») является письменным предложением (офертой) Поставщика заключить договор в соответствии со ст. 432–444 ГК РФ.",
      "Акцептом оферты является полная оплата настоящего Счета Покупателем (п. 3 ст. 438 ГК РФ).",
      "Счет действителен 7 (семь) рабочих дней с даты выставления.",
      "Предмет договора: предоставление доступа к SaaS MyUnion Pro по выбранному тарифу.",
      "Период предоставления услуг: " + periodLabel(period) + ".",
      "Споры подлежат рассмотрению по месту нахождения Поставщика.",
    ];
    doc.font(fontRegular).fontSize(9);
    for (const line of offerText) {
      doc.text(line, x, y, { width: 515 });
      y = doc.y + 4;
    }

    y += 18;
    doc.font(fontRegular).fontSize(10).text("Генеральный директор ООО «ЯППИКС» __________________ Усманов Р.Р.", x, y);

    const stampPath = path.join(process.cwd(), "public", "Печать.png");
    if (fs.existsSync(stampPath)) {
      try {
        doc.image(stampPath, 380, y - 40, { fit: [120, 120] });
      } catch (imgError) {
        console.warn("[invoice-offer] stamp image render warning:", imgError);
      }
    }

    doc.end();
    const pdfBuffer: Buffer = await new Promise((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });

    const filename = `schet-oferta-${offerNumber}.pdf`;
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdfBuffer.length),
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (err?.message?.includes("OrganizationBillingProfile")) {
      return NextResponse.json(
        { error: "Требуется применить миграцию платежного профиля" },
        { status: 500 }
      );
    }
    console.error("[api/subscription/invoice-offer] POST error:", e);
    return NextResponse.json({ error: "Ошибка генерации счета-оферты" }, { status: 500 });
  }
}

