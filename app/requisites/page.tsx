import type { Metadata } from "next";
import Link from "next/link";

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
  [
    "Юридический адрес",
    "127055, г. Москва, вн.тер.г. муниципальный округ Тверской, ул. Палиха, д. 7–9, к. 4, пом. 1/1",
  ],
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

export default function RequisitesPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 print:bg-white">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <Link
          href="/"
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white mb-8 print:hidden"
        >
          ← На главную
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Реквизиты
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
          ООО «ЯППИКС» — правообладатель программного обеспечения «МойСоюз» (myunion.pro)
        </p>

        {/* Юридические реквизиты */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
            Юридические и банковские реквизиты
          </h2>
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {ROWS.map(([label, value]) => (
                  <tr key={label}>
                    <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap align-top w-52">
                      {label}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 select-all">
                      {value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Контакты */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
            Контакты
          </h2>
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {CONTACTS.map(([label, text, href]) => (
                  <tr key={label}>
                    <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap align-top w-52">
                      {label}
                    </td>
                    <td className="px-4 py-2.5">
                      <a
                        href={href}
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {text}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700 flex flex-wrap gap-4 text-sm print:hidden">
          <Link href="/license" className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline">
            Публичная оферта
          </Link>
          <Link href="/privacy" className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline">
            Политика конфиденциальности
          </Link>
          <Link href="/for-organizations" className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline">
            Для организаций
          </Link>
        </div>
      </div>
    </div>
  );
}
