/*
  Warnings:

  - You are about to drop the `UniverseState` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "UniverseState" DROP CONSTRAINT "UniverseState_userId_fkey";

-- AlterTable
ALTER TABLE "Canvas" ADD COLUMN     "cameraX" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "cameraY" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "zoom" DOUBLE PRECISION NOT NULL DEFAULT 0.75,
ALTER COLUMN "title" SET DEFAULT 'Yeni Harita';

-- DropTable
DROP TABLE "UniverseState";
