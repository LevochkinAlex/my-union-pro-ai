import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function PartnerProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      firstName: true,
      lastName: true,
      middleName: true,
      email: true,
      phone: true,
      partnerRecord: {
        select: {
          name: true,
          logoUrl: true,
          description: true,
          inn: true,
          address: true,
          phone: true,
          email: true,
          website: true,
          contactLastName: true,
          contactFirstName: true,
          contactMiddleName: true,
          contactEmail: true,
          contactPhone: true,
          contactJobTitle: true,
        },
      },
    },
  });

  const partner = user?.partnerRecord;

  const infoRows: { label: string; value: string | null | undefined }[] = [
    { label: "Организация", value: partner?.name },
    { label: "ИНН", value: partner?.inn },
    { label: "Адрес", value: partner?.address },
    { label: "Телефон организации", value: partner?.phone },
    { label: "Email организации", value: partner?.email },
    { label: "Сайт", value: partner?.website },
  ];

  const contactRows: { label: string; value: string | null | undefined }[] = [
    {
      label: "ФИО",
      value: [partner?.contactLastName, partner?.contactFirstName, partner?.contactMiddleName]
        .filter(Boolean)
        .join(" ") || [user?.lastName, user?.firstName, user?.middleName].filter(Boolean).join(" ") || null,
    },
    { label: "Должность", value: partner?.contactJobTitle },
    { label: "Email", value: partner?.contactEmail || user?.email },
    { label: "Телефон", value: partner?.contactPhone || user?.phone },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
        Профиль
      </h1>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          Информация об организации
        </h2>
        {partner?.logoUrl ? (
          <div className="mb-6 flex justify-center sm:justify-start">
            <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-gray-900/50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={partner.logoUrl}
                alt={
                  partner.name
                    ? `Логотип ${partner.name}`
                    : "Логотип организации"
                }
                className="max-h-full max-w-full object-contain object-center"
              />
            </div>
          </div>
        ) : null}
        <dl className="divide-y divide-gray-100 dark:divide-gray-700">
          {infoRows.map((row) => (
            <div key={row.label} className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-4">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 sm:w-48 sm:flex-shrink-0">
                {row.label}
              </dt>
              <dd className="text-sm text-gray-900 dark:text-white">
                {row.value || <span className="text-gray-400 dark:text-gray-500">Не указано</span>}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          Контактное лицо
        </h2>
        <dl className="divide-y divide-gray-100 dark:divide-gray-700">
          {contactRows.map((row) => (
            <div key={row.label} className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-4">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 sm:w-48 sm:flex-shrink-0">
                {row.label}
              </dt>
              <dd className="text-sm text-gray-900 dark:text-white">
                {row.value || <span className="text-gray-400 dark:text-gray-500">Не указано</span>}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {partner?.description && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
            Описание
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {partner.description}
          </p>
        </div>
      )}

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Для изменения данных организации обратитесь к администратору.
        </p>
      </div>
    </div>
  );
}
