"use client";

interface Step4ConfirmationProps {
  profileData: any;
  uploadedDocs: { membership: File | null; contribution: File | null };
  additionalData: any;
  organizations: Array<{
    id: string;
    name: string;
    fullPath: string;
  }>;
  onBackToEdit: () => void;
}

export default function Step4Confirmation({
  profileData,
  uploadedDocs,
  additionalData,
  organizations,
  onBackToEdit,
}: Step4ConfirmationProps) {
  const selectedOrg = organizations.find((o) => o.id === profileData.organizationId);

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-2 text-blue-900 dark:text-blue-100">
          📋 Проверьте ваши данные перед генерацией документов
        </h3>
        <p className="text-sm text-blue-800 dark:text-blue-200">
          Убедитесь, что все данные указаны верно. Они будут использованы для создания официальных заявлений.
        </p>
      </div>

      {/* Основные данные */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <span className="text-blue-600">1.</span> Основные данные
        </h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500 dark:text-gray-400">ФИО:</span>
            <p className="font-medium text-gray-900 dark:text-white">
              {profileData.lastName} {profileData.firstName} {profileData.middleName || ""}
            </p>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Дата рождения:</span>
            <p className="font-medium text-gray-900 dark:text-white">
              {profileData.dateOfBirth ? new Date(profileData.dateOfBirth).toLocaleDateString("ru-RU") : "Не указана"}
            </p>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Телефон:</span>
            <p className="font-medium text-gray-900 dark:text-white">{profileData.phone}</p>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Email:</span>
            <p className="font-medium text-gray-900 dark:text-white">{profileData.email}</p>
          </div>
          <div className="col-span-2">
            <span className="text-gray-500 dark:text-gray-400">Адрес:</span>
            <p className="font-medium text-gray-900 dark:text-white">{profileData.address}</p>
          </div>
          <div className="col-span-2">
            <span className="text-gray-500 dark:text-gray-400">Организация:</span>
            <p className="font-medium text-gray-900 dark:text-white">
              {selectedOrg?.name || "Не выбрана"}
            </p>
            {selectedOrg && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {selectedOrg.fullPath}
              </p>
            )}
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Должность:</span>
            <p className="font-medium text-gray-900 dark:text-white">{profileData.jobTitle}</p>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Профессия:</span>
            <p className="font-medium text-gray-900 dark:text-white">{profileData.profession}</p>
          </div>
          <div className="col-span-2">
            <span className="text-gray-500 dark:text-gray-400">Образование:</span>
            <p className="font-medium text-gray-900 dark:text-white">{profileData.education}</p>
          </div>
        </div>
      </div>

      {/* Документы */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <span className="text-blue-600">2.</span> Загруженные документы
        </h4>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            {uploadedDocs.membership ? (
              <>
                <span className="text-green-600">✓</span>
                <span className="text-gray-900 dark:text-white">Заявление о вступлении</span>
                <span className="text-gray-500 dark:text-gray-400">({uploadedDocs.membership.name})</span>
              </>
            ) : (
              <>
                <span className="text-red-600">✗</span>
                <span className="text-gray-500 dark:text-gray-400">Заявление о вступлении не загружено</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {uploadedDocs.contribution ? (
              <>
                <span className="text-green-600">✓</span>
                <span className="text-gray-900 dark:text-white">Заявление о взносах</span>
                <span className="text-gray-500 dark:text-gray-400">({uploadedDocs.contribution.name})</span>
              </>
            ) : (
              <>
                <span className="text-red-600">✗</span>
                <span className="text-gray-500 dark:text-gray-400">Заявление о взносах не загружено</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Дополнительная информация */}
      {(additionalData.hobbies || additionalData.aboutMe || additionalData.additionalInfo) && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <span className="text-blue-600">3.</span> Дополнительная информация
          </h4>
          <div className="space-y-3 text-sm">
            {additionalData.hobbies && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Хобби:</span>
                <p className="font-medium text-gray-900 dark:text-white">{additionalData.hobbies}</p>
              </div>
            )}
            {additionalData.aboutMe && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">О себе:</span>
                <p className="font-medium text-gray-900 dark:text-white">{additionalData.aboutMe}</p>
              </div>
            )}
            {additionalData.additionalInfo && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Дополнительно:</span>
                <p className="font-medium text-gray-900 dark:text-white">{additionalData.additionalInfo}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Информационное сообщение */}
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
        <div className="flex gap-3">
          <div className="text-2xl">📄</div>
          <div>
            <h4 className="font-semibold text-green-900 dark:text-green-100 mb-1">
              Что произойдет дальше?
            </h4>
            <ul className="text-sm text-green-800 dark:text-green-200 space-y-1">
              <li>✓ Будут автоматически сгенерированы PDF-документы с вашими данными</li>
              <li>✓ Заявление о вступлении в профсоюз</li>
              <li>✓ Заявление о перечислении членских взносов</li>
              <li>✓ Документы будут доступны в разделе "Документы"</li>
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

