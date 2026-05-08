/*
  Warnings:

  - You are about to drop the column `categoryId` on the `AgentRunNoteSnapshot` table. All the data in the column will be lost.
  - You are about to drop the column `categoryId` on the `Note` table. All the data in the column will be lost.
  - You are about to drop the `NoteCategory` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Note" DROP CONSTRAINT "Note_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "NoteCategory" DROP CONSTRAINT "NoteCategory_userId_fkey";

-- DropIndex
DROP INDEX "Note_categoryId_idx";

-- AlterTable
ALTER TABLE "AgentRunNoteSnapshot" DROP COLUMN "categoryId";

-- AlterTable
ALTER TABLE "Note" DROP COLUMN "categoryId";

-- DropTable
DROP TABLE "NoteCategory";

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "encryptedValue" TEXT NOT NULL,
    "valuePreview" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppSetting_key_key" ON "AppSetting"("key");
