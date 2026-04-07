import type { Metadata } from "next";
import AnimateOnScroll from "@/components/landing/AnimateOnScroll";
import GlassCard from "@/components/landing/GlassCard";
import CopyRequisitesButton from "./CopyRequisitesButton";

export const metadata: Metadata = {
  title: "Реквизиты | ООО «ЯППИКС»",
  description: "Реквизиты ООО «ЯППИКС» — правообладателя программного обеспечения myunion.pro.",
};

const ROWS = [
  ["Полное наименование", "Общество с ограниченной ответственностью «ЯППИКС»"],
  ["Сокращённое наименование", "ООО «ЯППИКС»"],
  ["ОГРН", "1267700040684"],
  ["ИНН", "9707055804"],
  ["КПП", "770701001"],
  ["Юридический адрес", "127055, г. Москва, вн.тер.г. муниципальный округ Тверской, ул. Палиха, д. 7–9, к. 4, пом. 1/1"],
  ["Расчётный счёт", "40702810910002055576"],
  ["Банк", "АО «Тинькофф Банк»"],
  ["БИК", "044525974"],
  ["Корреспондентский счёт", "30101810145250000974"],
  ["Система налогообложения", "УСН (доходы, 6%)"],
  ["Генеральный директор", "Усманов Ренат Рушанович"],
] as const;

const CONTACTS = [
  ["Телефон", "+7 995 095 55 93", "tel:+79950955593"],
  ["Сайт правообладателя", "yappix.ru", "https://yappix.ru"],
  ["Сайт продукта", "myunion.pro", "https://myunion.pro"],
  ["Отдел продаж", "sales@yappix.ru", "mailto:sales@yappix.ru"],
  ["Руководство", "ceo@yappix.ru", "mailto:ceo@yappix.ru"],
  ["Техническая поддержка", "support@myunion.pro", "mailto:support@myunion.pro"],
] as const;

const COPY_TEXT = ROWS.map(([k, v]) => `${k}: ${v}`).join("\n");

export default function RequisitesPage() {
  return (
    <div className="relative py-10 sm:py-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <AnimateOnScroll>
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground sm:text-4xl">Реквизиты</h1>
              <p className="mt-2 text-muted-foreground">
                ООО «ЯППИКС» — правообладатель программного обеспечения «МойСоюз» (myunion.pro)
              </p>
            </div>
            <CopyRequisitesButton text={COPY_TEXT} />
          </div>
        </AnimateOnScroll>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Legal details */}
          <AnimateOnScroll delay={1}>
            <GlassCard hover={false} className="p-6 h-full">
              <h2 className="mb-4 text-lg font-semibold text-foreground">
                Юридические и банковские реквизиты
              </h2>
              <div className="space-y-3">
                {ROWS.map(([label, value]) => (
                  <div key={label} className="flex flex-col sm:flex-row sm:gap-4">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider min-w-[160px] shrink-0 sm:text-right">
                      {label}
                    </span>
                    <span className="text-sm text-foreground select-all">{value}</span>
                  </div>
                ))}
              </div>
            </GlassCard>
          </AnimateOnScroll>

          {/* Contacts */}
          <AnimateOnScroll delay={2}>
            <GlassCard hover={false} className="p-6 h-full">
              <h2 className="mb-4 text-lg font-semibold text-foreground">Контакты</h2>
              <div className="space-y-3">
                {CONTACTS.map(([label, text, href]) => (
                  <div key={label} className="flex flex-col sm:flex-row sm:gap-4">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider min-w-[160px] shrink-0 sm:text-right">
                      {label}
                    </span>
                    <a href={href} className="text-sm text-primary hover:underline">
                      {text}
                    </a>
                  </div>
                ))}
              </div>
            </GlassCard>
          </AnimateOnScroll>
        </div>
      </div>
    </div>
  );
}
