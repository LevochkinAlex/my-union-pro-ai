-- Переименовываем дефолтные каналы "Основной" в название организации.
-- Обновляем name, description и выставляем isMain = true.
UPDATE "NewsChannel" nc
SET
  name        = o.name,
  description = 'Канал новостей ' || o.name,
  "isMain"    = TRUE
FROM "Organization" o
WHERE nc."organizationId" = o.id
  AND nc.name = 'Основной';
