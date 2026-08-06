-- Ciphertext-only mobile sync store. No private workspace semantics belong here.
CREATE TABLE "BlindVault" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "protocolVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BlindVault_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BlindDevice" (
  "id" TEXT NOT NULL,
  "vaultId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "signingPublicKey" BYTEA NOT NULL,
  "agreementPublicKey" BYTEA NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "authorizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "lastAckServerSeq" BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT "BlindDevice_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BlindSyncRecord" (
  "serverSeq" BIGSERIAL NOT NULL,
  "vaultId" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "deviceSeq" BIGINT NOT NULL,
  "previousRecordHash" BYTEA NOT NULL,
  "objectLocator" BYTEA NOT NULL,
  "keyEpoch" INTEGER NOT NULL,
  "encodedRecord" BYTEA NOT NULL,
  "recordHash" BYTEA NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BlindSyncRecord_pkey" PRIMARY KEY ("serverSeq")
);
CREATE TABLE "BlindCheckpoint" (
  "id" TEXT NOT NULL,
  "vaultId" TEXT NOT NULL,
  "coversServerSeq" BIGINT NOT NULL,
  "keyEpoch" INTEGER NOT NULL,
  "ciphertext" BYTEA NOT NULL,
  "signature" BYTEA NOT NULL,
  "createdByDeviceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BlindCheckpoint_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BlindVault_ownerId_id_key" ON "BlindVault"("ownerId", "id");
CREATE INDEX "BlindDevice_vaultId_status_idx" ON "BlindDevice"("vaultId", "status");
CREATE UNIQUE INDEX "BlindSyncRecord_vaultId_recordId_key" ON "BlindSyncRecord"("vaultId", "recordId");
CREATE UNIQUE INDEX "BlindSyncRecord_vaultId_deviceId_deviceSeq_key" ON "BlindSyncRecord"("vaultId", "deviceId", "deviceSeq");
CREATE INDEX "BlindSyncRecord_vaultId_serverSeq_idx" ON "BlindSyncRecord"("vaultId", "serverSeq");
CREATE INDEX "BlindCheckpoint_vaultId_coversServerSeq_idx" ON "BlindCheckpoint"("vaultId", "coversServerSeq");
ALTER TABLE "BlindVault" ADD CONSTRAINT "BlindVault_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlindDevice" ADD CONSTRAINT "BlindDevice_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "BlindVault"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlindSyncRecord" ADD CONSTRAINT "BlindSyncRecord_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "BlindVault"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlindSyncRecord" ADD CONSTRAINT "BlindSyncRecord_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "BlindDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BlindCheckpoint" ADD CONSTRAINT "BlindCheckpoint_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "BlindVault"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlindCheckpoint" ADD CONSTRAINT "BlindCheckpoint_createdByDeviceId_fkey" FOREIGN KEY ("createdByDeviceId") REFERENCES "BlindDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
