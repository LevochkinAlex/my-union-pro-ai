# Руководство по конструктору документов

## Обзор

Конструктор документов позволяет супер-администраторам создавать и редактировать шаблоны документов с использованием WYSIWYG редактора (TinyMCE), похожего на Microsoft Word. Документы генерируются из шаблонов с подстановкой переменных пользователя.

## Архитектура

### Компоненты системы

1. **База данных** (`DocumentTemplate`)
   - Хранит HTML шаблоны с переменными
   - CSS стили для форматирования
   - Метаданные (название, описание, тип, активность)

2. **Конструктор документов** (`/admin/document-templates`)
   - WYSIWYG редактор TinyMCE
   - Редактор HTML кода
   - Управление шаблонами (создание, редактирование, удаление)

3. **Генерация документов** (`/api/documents/generate`)
   - Получает шаблоны по умолчанию для каждого типа документа
   - Рендерит HTML с подстановкой переменных
   - Генерирует PDF через Puppeteer

4. **Рендеринг** (`lib/document-templates/renderer.ts`)
   - Извлечение переменных из данных пользователя
   - Замена переменных в HTML шаблоне
   - Генерация PDF из HTML через Puppeteer

## Доступные переменные

В шаблонах можно использовать следующие переменные:

| Переменная | Описание | Пример |
|------------|----------|--------|
| `{{firstName}}` | Имя пользователя | Иван |
| `{{lastName}}` | Фамилия пользователя | Иванов |
| `{{middleName}}` | Отчество пользователя | Иванович |
| `{{fullName}}` | Полное ФИО | Иванов Иван Иванович |
| `{{fullNameGenitive}}` | ФИО в родительном падеже | Иванова Ивана Ивановича |
| `{{phone}}` | Телефон | +79871234567 |
| `{{email}}` | Email | user@example.com |
| `{{address}}` | Адрес | г. Москва, ул. Примерная, д. 1 |
| `{{jobTitle}}` | Должность | Врач-терапевт |
| `{{profession}}` | Профессия | Врач |
| `{{education}}` | Образование | Высшее медицинское |
| `{{organizationName}}` | Название организации | ГБУЗ "Городская больница №1" |
| `{{organizationInn}}` | ИНН организации | 1234567890 |
| `{{dateOfBirth}}` | Дата рождения (ДД.ММ.ГГГГ) | 01.01.1990 |
| `{{currentDate}}` | Текущая дата (ДД.ММ.ГГГГ) | 03.12.2024 |

## Создание шаблона

### Через админ-панель

1. Перейдите в `/admin/document-templates`
2. Нажмите "+ Создать шаблон"
3. Заполните форму:
   - **Название**: Название шаблона (например, "Заявление о вступлении")
   - **Описание**: Описание шаблона
   - **Тип документа**: Выберите тип (MEMBERSHIP_APPLICATION, CONTRIBUTION_APPLICATION и т.д.)
   - **HTML содержимое**: Используйте WYSIWYG редактор или HTML режим
   - **CSS стили**: Дополнительные стили (опционально)
   - **Активен**: Включить/выключить шаблон
   - **По умолчанию**: Установить как шаблон по умолчанию для данного типа

4. Используйте кнопки переменных для вставки переменных в шаблон
5. Нажмите "Сохранить"

### Форматирование в WYSIWYG редакторе

TinyMCE предоставляет следующие возможности:

- **Форматирование текста**: жирный, курсив, подчеркивание, зачеркивание
- **Заголовки**: H1, H2, H3, H4, H5, H6
- **Списки**: маркированные и нумерованные
- **Выравнивание**: по левому краю, по центру, по правому краю, по ширине
- **Цвета**: цвет текста и фона
- **Таблицы**: создание и редактирование таблиц
- **Разрывы страниц**: для PDF документов
- **Ссылки и изображения**: вставка ссылок и изображений

### Пример шаблона заявления

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: 'Times New Roman', serif;
      font-size: 14pt;
      line-height: 1.5;
      margin: 2cm;
      color: #000;
    }
    .header {
      text-align: right;
      margin-bottom: 2em;
    }
    .title {
      text-align: center;
      font-weight: bold;
      font-size: 16pt;
      margin-bottom: 1.5em;
      text-transform: uppercase;
    }
  </style>
</head>
<body>
  <div class="header">
    Председателю {{organizationName}}<br>
    от {{fullNameGenitive}}.<br>
    {{jobTitle}}
  </div>
  
  <div class="title">
    ЗАЯВЛЕНИЕ.
  </div>
  
  <div class="content">
    Прошу принять меня в Профсоюз работников здравоохранения РФ с {{currentDate}}
  </div>
  
  <div class="content">
    С уставом Профсоюза работников здравоохранения РФ ознакомлен(а) и обязуюсь исполнять.
  </div>
  
  <div class="footer">
    <div class="date">
      {{currentDate}}
    </div>
    <div class="signature">
      Личная подпись<br>
      <div class="signature-line"></div>
    </div>
  </div>
</body>
</html>
```

## Генерация документов

### Автоматическая генерация

Документы генерируются автоматически при:
- Заполнении профиля пользователем
- Запросе генерации через API `/api/documents/generate`

### Процесс генерации

1. Система получает шаблоны по умолчанию для типов:
   - `MEMBERSHIP_APPLICATION` (Заявление о вступлении)
   - `CONTRIBUTION_APPLICATION` (Заявление о взносах)

2. Для каждого шаблона:
   - Извлекаются переменные из данных пользователя
   - Заменяются переменные в HTML шаблоне
   - Добавляются CSS стили из шаблона
   - Генерируется PDF через Puppeteer

3. PDF документы сохраняются в базу данных как base64

## API Endpoints

### Получить список шаблонов

```http
GET /api/admin/document-templates
Authorization: Bearer <token>
```

**Параметры запроса:**
- `type` (опционально): Фильтр по типу документа
- `isActive` (опционально): Фильтр по активности

**Ответ:**
```json
{
  "templates": [
    {
      "id": "cmipufbw600001yw3bitaas6f",
      "name": "Заявление о вступлении в профсоюз",
      "description": "Шаблон заявления о вступлении",
      "type": "MEMBERSHIP_APPLICATION",
      "htmlContent": "<!DOCTYPE html>...",
      "cssStyles": null,
      "isActive": true,
      "isDefault": true,
      "createdAt": "2024-12-03T10:00:00.000Z",
      "updatedAt": "2024-12-03T10:00:00.000Z"
    }
  ]
}
```

### Создать шаблон

```http
POST /api/admin/document-templates
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Название шаблона",
  "description": "Описание",
  "type": "MEMBERSHIP_APPLICATION",
  "htmlContent": "<!DOCTYPE html>...",
  "cssStyles": "body { font-family: 'Times New Roman'; }",
  "isActive": true,
  "isDefault": false
}
```

### Обновить шаблон

```http
PUT /api/admin/document-templates/{id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Обновленное название",
  "htmlContent": "<!DOCTYPE html>...",
  ...
}
```

### Удалить шаблон

```http
DELETE /api/admin/document-templates/{id}
Authorization: Bearer <token>
```

**Ограничение**: Нельзя удалить шаблон по умолчанию. Сначала установите другой шаблон по умолчанию.

## Типы документов

- `MEMBERSHIP_APPLICATION` - Заявление о вступлении в профсоюз
- `CONTRIBUTION_APPLICATION` - Заявление о перечислении членских взносов
- `MEMBERSHIP_REMOVAL_APPLICATION` - Заявление о снятии с учета
- `MEMBERSHIP_TRANSFER_APPLICATION` - Заявление о переходе в другой профсоюз
- `APPEAL` - Обращение
- `OTHER` - Прочее

## Рекомендации по форматированию

### Для PDF документов

1. **Шрифты**: Используйте `Times New Roman` для официальных документов
2. **Размер шрифта**: 14pt для основного текста, 16pt для заголовков
3. **Отступы**: 2cm со всех сторон (уже настроено в Puppeteer)
4. **Выравнивание**: 
   - Заголовок справа вверху
   - Заголовок документа по центру
   - Основной текст по левому краю или по ширине
5. **Разрывы строк**: Используйте `<br>` для переносов строк
6. **Подписи**: Используйте подчеркивание для линии подписи

### CSS стили

Рекомендуемые стили для официальных документов:

```css
body {
  font-family: 'Times New Roman', serif;
  font-size: 14pt;
  line-height: 1.5;
  margin: 2cm;
  color: #000;
}

.header {
  text-align: right;
  margin-bottom: 2em;
}

.title {
  text-align: center;
  font-weight: bold;
  font-size: 16pt;
  margin-bottom: 1.5em;
  text-transform: uppercase;
}

.content {
  margin-bottom: 1em;
  font-size: 14pt;
  text-align: justify;
  text-indent: 30px;
}

.footer {
  margin-top: 2em;
  display: flex;
  justify-content: space-between;
}

.signature-line {
  border-top: 1px solid #000;
  width: 200px;
  display: inline-block;
  margin-top: 5px;
}
```

## Устранение неполадок

### Документы не генерируются

1. Проверьте, что шаблоны по умолчанию существуют и активны
2. Проверьте логи сервера на наличие ошибок
3. Убедитесь, что Puppeteer установлен и доступен
4. Проверьте, что все переменные в шаблоне существуют

### Форматирование не сохраняется

1. Убедитесь, что CSS стили правильно добавлены в шаблон
2. Проверьте, что стили применяются к правильным элементам
3. Используйте инспектор браузера для проверки рендеринга HTML

### Переменные не заменяются

1. Проверьте правильность написания переменных (двойные фигурные скобки)
2. Убедитесь, что данные пользователя заполнены
3. Проверьте логи для ошибок при извлечении переменных

## Миграция со старых шаблонов

Старые шаблоны, созданные через `lib/pdf/templates/`, можно мигрировать:

1. Откройте старый шаблон
2. Скопируйте HTML структуру
3. Замените статические данные на переменные `{{variableName}}`
4. Создайте новый шаблон через конструктор
5. Установите как шаблон по умолчанию

## Скрипты для управления

### Создание начальных шаблонов

```bash
pnpm tsx scripts/create-initial-document-templates.ts
```

### Очистка документов несуществующих пользователей

```bash
pnpm tsx scripts/cleanup-orphaned-documents.ts
```

## Дополнительные ресурсы

- [TinyMCE Documentation](https://www.tiny.cloud/docs/)
- [Puppeteer Documentation](https://pptr.dev/)
- [HTML to PDF Best Practices](https://www.tiny.cloud/docs/tinymce/latest/printing/)

