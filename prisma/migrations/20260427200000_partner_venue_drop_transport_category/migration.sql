-- Категория transport_logistics удалена из справочника
UPDATE "PartnerVenue"
SET "serviceCategoryCode" = NULL,
    "serviceCode" = NULL
WHERE "serviceCategoryCode" = 'transport_logistics';
