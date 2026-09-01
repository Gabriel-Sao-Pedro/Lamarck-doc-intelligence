-- AlterTable
ALTER TABLE "Document" ADD COLUMN "reviewVersion" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "ReviewCorrection" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "correctedFields" JSONB NOT NULL,
    "reviewedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewCorrection_documentId_version_key" ON "ReviewCorrection"("documentId", "version");

-- CreateIndex
CREATE INDEX "ReviewCorrection_documentId_idx" ON "ReviewCorrection"("documentId");

-- CreateIndex
CREATE INDEX "ReviewCorrection_reviewedBy_idx" ON "ReviewCorrection"("reviewedBy");

-- AddForeignKey
ALTER TABLE "ReviewCorrection" ADD CONSTRAINT "ReviewCorrection_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
