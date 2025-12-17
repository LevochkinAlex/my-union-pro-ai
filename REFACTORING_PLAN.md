# План рефакторинга больших файлов

## 📊 Статистика файлов

| Файл | Строк | Приоритет | Статус |
|------|-------|-----------|--------|
| `app/dashboard/profile/page.tsx` | 2345 | 🔴 Высокий | В процессе |
| `components/posts/PostCard.tsx` | 2006 | 🔴 Высокий | Ожидает |
| `components/profile/QuestionnaireModal.tsx` | 1232 | 🟡 Средний | Ожидает |
| `components/posts/CreatePost.tsx` | 1212 | 🟡 Средний | Ожидает |
| `lib/profile-extraction.ts` | 1206 | 🟡 Средний | Ожидает |
| `app/api/telegram/webhook/route.ts` | 1161 | 🟢 Низкий | Ожидает |

---

## 1. ✅ `app/dashboard/profile/page.tsx` (2345 строк)

### Структура разбиения:

#### Созданные хуки:
- ✅ `hooks/useProfileData.ts` - управление основными данными профиля
- ✅ `hooks/useChildren.ts` - управление детьми
- ✅ `hooks/useAwards.ts` - управление наградами
- ✅ `hooks/useEducation.ts` - управление образованием
- ✅ `hooks/useProfessions.ts` - управление профессиями
- ✅ `hooks/useTraining.ts` - управление обучением

#### Компоненты для создания:
- `components/profile/ProfileTabs.tsx` - навигация по вкладкам ✅
- `components/profile/ProfileTab.tsx` - основная вкладка профиля
- `components/profile/AdditionalTab.tsx` - дополнительная информация
- `components/profile/MembershipTab.tsx` - информация о членстве
- `components/profile/EducationTab.tsx` - образование
- `components/profile/AwardsTab.tsx` - награды
- `components/profile/ChildrenForm.tsx` - форма для детей
- `components/profile/AwardForm.tsx` - форма для наград
- `components/profile/EducationForm.tsx` - форма для образования

#### Утилиты:
- `lib/profile/validation.ts` - валидация форм
- `lib/profile/maritalStatus.ts` - маппинг семейного положения

---

## 2. `components/posts/PostCard.tsx` (2006 строк)

### План разбиения:

#### Компоненты:
- `components/posts/PostCardHeader.tsx` - заголовок поста (автор, дата, меню)
- `components/posts/PostCardContent.tsx` - содержимое поста
- `components/posts/PostCardAttachments.tsx` - вложения
- `components/posts/PostCardActions.tsx` - действия (лайк, комментарии)
- `components/posts/PostComments.tsx` - секция комментариев
- `components/posts/PostCommentItem.tsx` - отдельный комментарий
- `components/posts/PostEditModal.tsx` - модалка редактирования

#### Хуки:
- `hooks/usePostCard.ts` - основная логика поста
- `hooks/usePostComments.ts` - логика комментариев
- `hooks/usePostLikes.ts` - логика лайков

#### Утилиты:
- `lib/posts/postUtils.ts` - утилиты для постов

---

## 3. `components/profile/QuestionnaireModal.tsx` (1232 строки)

### План разбиения:

#### Компоненты:
- `components/profile/QuestionnaireModal.tsx` - основной модальный компонент (упрощенный)
- `components/profile/QuestionnaireStep.tsx` - отдельный шаг анкеты
- `components/profile/QuestionnaireNavigation.tsx` - навигация между шагами

#### Хуки:
- `hooks/useQuestionnaire.ts` - логика анкеты

---

## 4. `components/posts/CreatePost.tsx` (1212 строк)

### План разбиения:

#### Компоненты:
- `components/posts/CreatePostForm.tsx` - основная форма
- `components/posts/CreatePostEditor.tsx` - редактор контента
- `components/posts/CreatePostAttachments.tsx` - управление вложениями
- `components/posts/CreatePostPreview.tsx` - превью поста

#### Хуки:
- `hooks/useCreatePost.ts` - логика создания поста

---

## 5. `lib/profile-extraction.ts` (1206 строк)

### План разбиения:

#### Модули:
- `lib/profile-extraction/types.ts` - типы
- `lib/profile-extraction/parsers.ts` - парсеры для разных форматов
- `lib/profile-extraction/validators.ts` - валидаторы
- `lib/profile-extraction/formatters.ts` - форматтеры

---

## 6. `app/api/telegram/webhook/route.ts` (1161 строка)

### План разбиения:

#### Модули:
- `lib/telegram/handlers/message.ts` - обработка сообщений
- `lib/telegram/handlers/callback.ts` - обработка callback
- `lib/telegram/handlers/command.ts` - обработка команд
- `lib/telegram/utils.ts` - утилиты

---

## 📝 Принципы рефакторинга

1. **Разделение ответственности**: Каждый модуль отвечает за одну задачу
2. **Переиспользование**: Общая логика выносится в хуки и утилиты
3. **Читаемость**: Файлы не должны превышать 300-400 строк
4. **Тестируемость**: Мелкие модули легче тестировать
5. **Производительность**: Использование `React.memo` где необходимо

---

## ✅ Прогресс

- [x] Созданы хуки для профиля (useProfileData, useChildren, useAwards, useEducation, useProfessions, useTraining)
- [x] Создан компонент ProfileTabs
- [ ] Рефакторинг основного файла profile/page.tsx
- [ ] Рефакторинг PostCard.tsx
- [ ] Рефакторинг остальных файлов

---

**Дата начала:** 2024-12-17  
**Статус:** В процессе

