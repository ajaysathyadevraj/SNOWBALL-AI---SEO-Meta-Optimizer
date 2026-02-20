-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "descriptionHtml" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "seoScore" INTEGER NOT NULL DEFAULT 0,
    "seoIssues" TEXT NOT NULL DEFAULT '[]',
    "shopifyUpdatedAt" TEXT,
    "lastScoredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
