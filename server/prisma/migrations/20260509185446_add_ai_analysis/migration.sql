-- DropIndex
DROP INDEX IF EXISTS "Notification_strategyId_date_key";

-- CreateTable
CREATE TABLE "AiAnalysis" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ticker" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "llmProvider" TEXT NOT NULL,
    "content" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "AiAnalysis_ticker_idx" ON "AiAnalysis"("ticker");
