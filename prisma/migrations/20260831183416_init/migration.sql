-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'RETRYING', 'COMPLETED', 'NEEDS_REVIEW', 'FAILED');

-- CreateEnum
CREATE TYPE "ProcessingRunStatus" AS ENUM ('STARTED', 'SUCCEEDED', 'TECHNICAL_FAILURE', 'SEMANTIC_MISMATCH');

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'RECEIVED',
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessingJob" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "claimedBy" TEXT,
    "claimedAt" TIMESTAMP(3),
    "leaseExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessingRun" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "ProcessingRunStatus" NOT NULL DEFAULT 'STARTED',
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "modelVersion" TEXT,
    "promptId" TEXT,
    "promptVersion" TEXT,
    "promptHash" TEXT,
    "outputSchemaVersion" TEXT,
    "technicalErrorType" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ProcessingRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentResult" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "processingRunId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Document_sha256_key" ON "Document"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document"("storageKey");

-- CreateIndex
CREATE INDEX "Document_status_idx" ON "Document"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessingJob_documentId_key" ON "ProcessingJob"("documentId");

-- CreateIndex
CREATE INDEX "ProcessingJob_leaseExpiresAt_idx" ON "ProcessingJob"("leaseExpiresAt");

-- CreateIndex
CREATE INDEX "ProcessingRun_documentId_idx" ON "ProcessingRun"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentResult_processingRunId_key" ON "DocumentResult"("processingRunId");

-- CreateIndex
CREATE INDEX "DocumentResult_documentId_idx" ON "DocumentResult"("documentId");

-- AddForeignKey
ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingRun" ADD CONSTRAINT "ProcessingRun_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentResult" ADD CONSTRAINT "DocumentResult_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentResult" ADD CONSTRAINT "DocumentResult_processingRunId_fkey" FOREIGN KEY ("processingRunId") REFERENCES "ProcessingRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
