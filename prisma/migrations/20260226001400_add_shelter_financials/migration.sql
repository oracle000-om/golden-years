-- CreateTable
CREATE TABLE "shelter_financials" (
    "id" TEXT NOT NULL,
    "shelter_id" TEXT NOT NULL,
    "ein" TEXT,
    "ntee_code" TEXT,
    "tax_period" INTEGER,
    "total_revenue" INTEGER,
    "total_expenses" INTEGER,
    "total_assets" INTEGER,
    "total_liabilities" INTEGER,
    "net_assets" INTEGER,
    "contributions" INTEGER,
    "program_revenue" INTEGER,
    "fundraising_expense" INTEGER,
    "officer_compensation" INTEGER,
    "filing_history" JSONB,
    "propublica_url" TEXT,
    "last_scraped_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shelter_financials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shelter_financials_shelter_id_key" ON "shelter_financials"("shelter_id");

-- AddForeignKey
ALTER TABLE "shelter_financials" ADD CONSTRAINT "shelter_financials_shelter_id_fkey" FOREIGN KEY ("shelter_id") REFERENCES "shelters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
