-- Миграция постов в формат статей
-- Конвертирует посты с длинным контентом (>300 символов) или HTML разметкой в тип "article"

-- Показать текущую статистику
SELECT "postType", COUNT(*) as count 
FROM "UserPost" 
GROUP BY "postType";

-- Конвертировать длинные посты в статьи
UPDATE "UserPost" 
SET "postType" = 'article' 
WHERE "postType" = 'text' 
  AND (
    LENGTH("content") > 300 
    OR "content" LIKE '%<%>%'
  );

-- Показать новую статистику
SELECT "postType", COUNT(*) as count 
FROM "UserPost" 
GROUP BY "postType";

-- Показать статьи с обложками
SELECT 
  id, 
  LEFT("content", 50) as content_preview,
  "coverImage" IS NOT NULL as has_cover,
  "videoMetadata" IS NOT NULL as has_video
FROM "UserPost" 
WHERE "postType" = 'article'
LIMIT 20;

