-- CreateTable
CREATE TABLE "UserIntegrationSetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "settingKey" TEXT NOT NULL,
    "encryptedValue" TEXT NOT NULL,
    "valuePreview" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserIntegrationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserIntegrationSetting_userId_provider_settingKey_key" ON "UserIntegrationSetting"("userId", "provider", "settingKey");

-- CreateIndex
CREATE INDEX "UserIntegrationSetting_userId_provider_idx" ON "UserIntegrationSetting"("userId", "provider");

-- AddForeignKey
ALTER TABLE "UserIntegrationSetting" ADD CONSTRAINT "UserIntegrationSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
