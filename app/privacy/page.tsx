import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Политика конфиденциальности | МойСоюз",
  description: "Политика конфиденциальности и обработки персональных данных ООО «ЯППИКС»",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <Link
          href="/login"
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white mb-8"
        >
          ← На страницу входа
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Политика конфиденциальности
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
          и обработки персональных данных
        </p>

        <div className="prose prose-gray dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 space-y-8">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              Оператор персональных данных
            </h2>
            <p className="mb-2">
              <strong>Общество с ограниченной ответственностью «ЯППИКС»</strong>
              <br />
              Сокращённое наименование: ООО «ЯППИКС»
            </p>
            <ul className="list-none text-sm space-y-1">
              <li>ОГРН: 1267700040684</li>
              <li>ИНН: 9707055804</li>
              <li>КПП: 770701001</li>
              <li>
                Юридический адрес: 127055, г. Москва, вн.тер.г. муниципальный
                округ Тверской, ул. Палиха, д. 7–9, к. 4, пом. 1/1
              </li>
              <li>
                Электронная почта:{" "}
                <a
                  href="mailto:support@myunion.pro"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  support@myunion.pro
                </a>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              1. Общие положения
            </h2>
            <p>
              Настоящая политика конфиденциальности (далее — Политика) определяет
              порядок обработки персональных данных пользователей сервиса
              «МойСоюз» (далее — Сервис), условия их защиты и использования.
              Оператор обеспечивает соблюдение требований Федерального закона от
              27.07.2006 № 152-ФЗ «О персональных данных» и иных применимых норм.
            </p>
            <p className="mt-3">
              Использование Сервиса означает согласие пользователя с настоящей
              Политикой. В случае несогласия с её условиями необходимо
              воздержаться от использования Сервиса.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              2. Какие данные мы обрабатываем
            </h2>
            <p className="mb-2">Оператор может обрабатывать следующие категории персональных данных:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>номер телефона и адрес электронной почты;</li>
              <li>фамилия, имя, отчество;</li>
              <li>дата рождения;</li>
              <li>адрес проживания;</li>
              <li>данные о месте работы, должности, образовании;</li>
              <li>идентификаторы в мессенджерах (Telegram, MAX и др.) при привязке аккаунта;</li>
              <li>технические данные (IP-адрес, данные cookie, сведения о браузере и устройстве) в объёме, необходимом для работы Сервиса и безопасности.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              3. Цели и правовые основания обработки
            </h2>
            <p className="mb-2">Персональные данные обрабатываются в целях:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>регистрации и идентификации пользователя, входа в учётную запись;</li>
              <li>оказания услуг в рамках функционала Сервиса (в т.ч. документы, заявления, уведомления);</li>
              <li>связи с пользователем (поддержка, уведомления);</li>
              <li>обеспечения безопасности и предотвращения злоупотреблений;</li>
              <li>исполнения договоров и соблюдения требований законодательства.</li>
            </ul>
            <p className="mt-3">
              Обработка осуществляется на основании согласия пользователя,
              исполнения договора, законного интереса оператора или обязанности,
              возложенной законодательством.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              4. Хранение и защита данных
            </h2>
            <p>
              Персональные данные хранятся в течение срока, необходимого для
              достижения целей обработки, и в соответствии с требованиями
              законодательства. Оператор применяет организационные и
              технические меры для защиты данных от неправомерного доступа,
              уничтожения, изменения или распространения. Доступ к персональным
              данным имеют только уполномоченные лица в объёме, необходимом для
              выполнения служебных обязанностей.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              5. Права субъекта персональных данных
            </h2>
            <p className="mb-2">Вы имеете право:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>получать информацию об обработке ваших персональных данных;</li>
              <li>требовать уточнения, блокирования или уничтожения данных в случаях, предусмотренных законом;</li>
              <li>отозвать согласие на обработку (если обработка основана на согласии);</li>
              <li>обжаловать действия оператора в уполномоченный орган по защите прав субъектов персональных данных.</li>
            </ul>
            <p className="mt-3">
              Для реализации указанных прав направьте запрос на{" "}
              <a
                href="mailto:support@myunion.pro"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                support@myunion.pro
              </a>
              . Оператор рассмотрит обращение в сроки, установленные законом.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              6. Передача данных третьим лицам
            </h2>
            <p>
              Оператор может передавать персональные данные контрагентам только
              в объёме, необходимом для оказания услуг (например, доставка
              сообщений, хостинг), при условии соблюдения ими требований по
              защите персональных данных. Передача в государственные органы
              осуществляется в случаях, предусмотренных законодательством РФ.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              7. Изменение Политики
            </h2>
            <p>
              Оператор вправе вносить изменения в настоящую Политику.
              Актуальная версия размещается по адресу Сервиса. Продолжение
              использования Сервиса после публикации изменений означает принятие
              обновлённой Политики.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              8. Контакты
            </h2>
            <p>
              По всем вопросам, связанным с обработкой персональных данных и
              настоящей Политикой, вы можете обратиться к оператору:
            </p>
            <p className="mt-2">
              ООО «ЯППИКС»<br />
              Эл. почта:{" "}
              <a
                href="mailto:support@myunion.pro"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                support@myunion.pro
              </a>
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
          <Link
            href="/login"
            className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
          >
            ← Вернуться на страницу входа
          </Link>
        </div>
      </div>
    </div>
  );
}
