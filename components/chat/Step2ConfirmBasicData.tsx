"use client";

interface Step2ConfirmBasicDataProps {
  profileData: any;
  organizations: Array<{
    id: string;
    name: string;
    fullPath: string;
  }>;
  onBackToEdit: () => void;
}

export default function Step2ConfirmBasicData({
  profileData,
  organizations,
  onBackToEdit,
}: Step2ConfirmBasicDataProps) {
  const selectedOrg = organizations.find((o) => o.id === profileData.organizationId);

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-2 text-blue-900 dark:text-blue-100">
          📋 Проверьте ваши данные
        </h3>
        <p className="text-sm text-blue-800 dark:text-blue-200">
          Убедитесь, что все данные указаны верно. На основе этих данных будут сгенерированы заявления для печати.
        </p>
      </div>

      {/* Основные данные */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-5">
        <h4 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2 text-lg">
          Основные данные
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">ФИО</span>
            <p className="font-medium text-gray-900 dark:text-white">
              {profileData.lastName} {profileData.firstName} {profileData.middleName || ""}
            </p>
          </div>
          
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Дата рождения</span>
            <p className="font-medium text-gray-900 dark:text-white">
              {profileData.dateOfBirth ? new Date(profileData.dateOfBirth).toLocaleDateString("ru-RU") : "Не указана"}
            </p>
          </div>
          
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Телефон</span>
            <p className="font-medium text-gray-900 dark:text-white">{profileData.phone}</p>
          </div>
          
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Email</span>
            <p className="font-medium text-gray-900 dark:text-white">{profileData.email}</p>
          </div>
          
          <div className="col-span-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Адрес</span>
            <p className="font-medium text-gray-900 dark:text-white">{profileData.address}</p>
          </div>
          
          <div className="col-span-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Организация (ППО)</span>
            <p className="font-medium text-gray-900 dark:text-white">
              {selectedOrg?.name || "Не выбрана"}
            </p>
            {selectedOrg && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {selectedOrg.fullPath}
              </p>
            )}
          </div>
          
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Должность</span>
            <p className="font-medium text-gray-900 dark:text-white">{profileData.jobTitle}</p>
          </div>
          
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Профессия</span>
            <p className="font-medium text-gray-900 dark:text-white">{profileData.profession}</p>
          </div>
          
          <div className="col-span-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Образование</span>
            <p className="font-medium text-gray-900 dark:text-white">{profileData.education}</p>
          </div>
        </div>
      </div>

      {/* Информационное сообщение */}
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
        <div className="flex gap-3">
          <div className="text-2xl">📄</div>
          <div>
            <h4 className="font-semibold text-green-900 dark:text-green-100 mb-1">
              Что произойдет дальше?
            </h4>
            <ul className="text-sm text-green-800 dark:text-green-200 space-y-1">
              <li>✓ Будут автоматически сгенерированы PDF-заявления с этими данными</li>
              <li>✓ Вы сможете скачать и распечатать документы</li>
              <li>✓ Подпишите документы и загрузите обратно на следующем шаге</li>
              <li>✓ Затем можно добавить дополнительную информацию о себе (опционально)</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <span>Нашли ошибку?</span>
        <button
          type="button"
          onClick={onBackToEdit}
          className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
        >
          Вернуться к редактированию
        </button>
      </div>
    </div>
  );
}

