-- CreateTable для NewsView
CREATE TABLE IF NOT EXISTS "NewsView" (
    "id" TEXT NOT NULL,
    "newsPostId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsView_pkey" PRIMARY KEY ("id")
);

-- CreateTable для PostView
CREATE TABLE IF NOT EXISTS "PostView" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "NewsView_newsPostId_userId_key" ON "NewsView"("newsPostId", "userId");
CREATE INDEX IF NOT EXISTS "NewsView_newsPostId_idx" ON "NewsView"("newsPostId");
CREATE INDEX IF NOT EXISTS "NewsView_userId_idx" ON "NewsView"("userId");
CREATE INDEX IF NOT EXISTS "NewsView_viewedAt_idx" ON "NewsView"("viewedAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PostView_postId_userId_key" ON "PostView"("postId", "userId");
CREATE INDEX IF NOT EXISTS "PostView_postId_idx" ON "PostView"("postId");
CREATE INDEX IF NOT EXISTS "PostView_userId_idx" ON "PostView"("userId");
CREATE INDEX IF NOT EXISTS "PostView_viewedAt_idx" ON "PostView"("viewedAt");

-- AddForeignKey
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'NewsView_newsPostId_fkey'
    ) THEN
        ALTER TABLE "NewsView" ADD CONSTRAINT "NewsView_newsPostId_fkey" 
        FOREIGN KEY ("newsPostId") REFERENCES "NewsPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'NewsView_userId_fkey'
    ) THEN
        ALTER TABLE "NewsView" ADD CONSTRAINT "NewsView_userId_fkey" 
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'PostView_postId_fkey'
    ) THEN
        ALTER TABLE "PostView" ADD CONSTRAINT "PostView_postId_fkey" 
        FOREIGN KEY ("postId") REFERENCES "UserPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'PostView_userId_fkey'
    ) THEN
        ALTER TABLE "PostView" ADD CONSTRAINT "PostView_userId_fkey" 
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

