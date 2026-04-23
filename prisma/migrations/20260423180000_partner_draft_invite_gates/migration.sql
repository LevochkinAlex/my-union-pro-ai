-- Трекинг цепочки «приглашение → открытие ссылки → первый заход админа в карточку» для статуса Черновик
ALTER TABLE "Partner" ADD COLUMN "cabinetInviteSentAt" TIMESTAMP(3);
ALTER TABLE "Partner" ADD COLUMN "cabinetInviteFirstOpenAt" TIMESTAMP(3);
ALTER TABLE "Partner" ADD COLUMN "adminPartnerCardFirstSeenAt" TIMESTAMP(3);

-- Новые карточки из админки по умолчанию — черновик
ALTER TABLE "Partner" ALTER COLUMN "moderationStatus" SET DEFAULT 'DRAFT';
