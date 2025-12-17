-- Добавление индексов для оптимизации поиска пользователей
-- Эти индексы значительно ускорят запросы с поиском и фильтрацией

-- Индекс для сортировки по дате создания
CREATE INDEX IF NOT EXISTS "User_createdAt_idx" ON "User"("createdAt" DESC);

-- Индекс для фильтрации по роли
CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");

-- Составной индекс для поиска по ФИО (для быстрого поиска по имени)
CREATE INDEX IF NOT EXISTS "User_firstName_lastName_middleName_idx" ON "User"("firstName", "lastName", "middleName");

-- Составной индекс для фильтрации по организации с сортировкой по дате
CREATE INDEX IF NOT EXISTS "User_organizationId_createdAt_idx" ON "User"("organizationId", "createdAt" DESC);

-- Индексы для полнотекстового поиска (GIN индексы для ILIKE запросов)
-- Примечание: PostgreSQL не поддерживает GIN индексы для обычных текстовых полей напрямую
-- Но мы можем создать функциональные индексы для case-insensitive поиска
CREATE INDEX IF NOT EXISTS "User_firstName_lower_idx" ON "User"(LOWER("firstName"));
CREATE INDEX IF NOT EXISTS "User_lastName_lower_idx" ON "User"(LOWER("lastName"));
CREATE INDEX IF NOT EXISTS "User_middleName_lower_idx" ON "User"(LOWER("middleName"));
CREATE INDEX IF NOT EXISTS "User_email_lower_idx" ON "User"(LOWER("email"));

