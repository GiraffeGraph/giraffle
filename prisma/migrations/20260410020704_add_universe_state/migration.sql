-- CreateTable
CREATE TABLE "UniverseState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cameraX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cameraY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "zoom" DOUBLE PRECISION NOT NULL DEFAULT 0.75,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UniverseState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UniverseState_userId_key" ON "UniverseState"("userId");

-- CreateIndex
CREATE INDEX "UniverseState_userId_idx" ON "UniverseState"("userId");

-- AddForeignKey
ALTER TABLE "UniverseState" ADD CONSTRAINT "UniverseState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
