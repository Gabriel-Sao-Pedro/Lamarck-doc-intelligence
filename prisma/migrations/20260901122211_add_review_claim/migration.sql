-- CreateTable
CREATE TABLE "ReviewClaim" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "claimToken" TEXT NOT NULL,
    "leaseExpiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewClaim_documentId_key" ON "ReviewClaim"("documentId");

-- CreateIndex
CREATE INDEX "ReviewClaim_leaseExpiresAt_idx" ON "ReviewClaim"("leaseExpiresAt");

-- AddForeignKey
ALTER TABLE "ReviewClaim" ADD CONSTRAINT "ReviewClaim_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
