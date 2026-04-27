-- Была категория spa_relax, теперь все услуги в wellness
UPDATE "PartnerVenue"
SET "serviceCategoryCode" = 'wellness'
WHERE "serviceCategoryCode" = 'spa_relax';
