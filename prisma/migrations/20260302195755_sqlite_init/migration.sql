-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "styleNumber" TEXT NOT NULL,
    "styleDesc" TEXT,
    "color" TEXT,
    "colorDesc" TEXT,
    "styleColor" TEXT,
    "season" TEXT NOT NULL,
    "seasonType" TEXT,
    "divisionDesc" TEXT,
    "categoryDesc" TEXT,
    "category" TEXT,
    "productLine" TEXT,
    "productLineDesc" TEXT,
    "labelDesc" TEXT,
    "designerName" TEXT,
    "techDesignerName" TEXT,
    "countryOfOrigin" TEXT,
    "factoryName" TEXT,
    "msrp" REAL NOT NULL DEFAULT 0,
    "price" REAL NOT NULL DEFAULT 0,
    "cost" REAL NOT NULL DEFAULT 0,
    "cadMsrp" REAL,
    "cadPrice" REAL,
    "carryOver" BOOLEAN NOT NULL DEFAULT false,
    "carryForward" BOOLEAN NOT NULL DEFAULT false,
    "sellingSeasons" TEXT,
    "htsCode" TEXT,
    "styleColorNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "styleNumber" TEXT NOT NULL,
    "styleDesc" TEXT,
    "colorCode" TEXT,
    "colorDesc" TEXT,
    "season" TEXT NOT NULL,
    "seasonType" TEXT,
    "customer" TEXT,
    "customerType" TEXT,
    "salesRep" TEXT,
    "divisionDesc" TEXT,
    "categoryDesc" TEXT,
    "gender" TEXT,
    "unitsBooked" INTEGER NOT NULL DEFAULT 0,
    "unitsOpen" INTEGER NOT NULL DEFAULT 0,
    "revenue" REAL NOT NULL DEFAULT 0,
    "shipped" REAL NOT NULL DEFAULT 0,
    "cost" REAL NOT NULL DEFAULT 0,
    "wholesalePrice" REAL NOT NULL DEFAULT 0,
    "msrp" REAL NOT NULL DEFAULT 0,
    "netUnitPrice" REAL NOT NULL DEFAULT 0,
    "orderType" TEXT,
    "invoiceDate" DATETIME,
    "accountingPeriod" TEXT,
    "invoiceNumber" TEXT,
    "shipToState" TEXT,
    "returnedAtNet" REAL NOT NULL DEFAULT 0,
    "shippedAtNet" REAL NOT NULL DEFAULT 0,
    "totalPrice" REAL NOT NULL DEFAULT 0,
    "commissionRate" REAL NOT NULL DEFAULT 0,
    "ytdNetInvoicing" REAL NOT NULL DEFAULT 0,
    "ytdCreditMemos" REAL NOT NULL DEFAULT 0,
    "ytdSales" REAL NOT NULL DEFAULT 0,
    "warehouse" TEXT,
    "warehouseDesc" TEXT,
    "openAtNet" REAL NOT NULL DEFAULT 0,
    "openOrder" REAL NOT NULL DEFAULT 0,
    "returned" REAL NOT NULL DEFAULT 0,
    "shippedAtMsrp" REAL NOT NULL DEFAULT 0,
    "totalAtNet" REAL NOT NULL DEFAULT 0,
    "totalAtWholesale" REAL NOT NULL DEFAULT 0,
    "returnedAtWholesale" REAL NOT NULL DEFAULT 0,
    "shipToCity" TEXT,
    "shipToZip" TEXT,
    "billToState" TEXT,
    "billToCity" TEXT,
    "billToZip" TEXT,
    "unitsShipped" INTEGER NOT NULL DEFAULT 0,
    "unitsReturned" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Pricing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "styleNumber" TEXT NOT NULL,
    "styleDesc" TEXT,
    "colorCode" TEXT,
    "colorDesc" TEXT,
    "season" TEXT NOT NULL,
    "seasonType" TEXT,
    "seasonDesc" TEXT,
    "price" REAL NOT NULL DEFAULT 0,
    "msrp" REAL NOT NULL DEFAULT 0,
    "cost" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Cost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "styleNumber" TEXT NOT NULL,
    "styleName" TEXT,
    "season" TEXT NOT NULL,
    "seasonType" TEXT,
    "factory" TEXT,
    "countryOfOrigin" TEXT,
    "designTeam" TEXT,
    "developer" TEXT,
    "fob" REAL NOT NULL DEFAULT 0,
    "landed" REAL NOT NULL DEFAULT 0,
    "dutyCost" REAL NOT NULL DEFAULT 0,
    "tariffCost" REAL NOT NULL DEFAULT 0,
    "freightCost" REAL NOT NULL DEFAULT 0,
    "overheadCost" REAL NOT NULL DEFAULT 0,
    "suggestedMsrp" REAL,
    "suggestedWholesale" REAL,
    "margin" REAL,
    "costSource" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ImportLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "season" TEXT,
    "recordCount" INTEGER NOT NULL,
    "importedBy" TEXT,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planning',
    "hasSalesData" BOOLEAN NOT NULL DEFAULT false,
    "hasLineList" BOOLEAN NOT NULL DEFAULT false,
    "hasPricing" BOOLEAN NOT NULL DEFAULT false,
    "hasCosts" BOOLEAN NOT NULL DEFAULT false,
    "hasInventory" BOOLEAN NOT NULL DEFAULT false,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Inventory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "styleNumber" TEXT NOT NULL,
    "styleDesc" TEXT,
    "color" TEXT,
    "colorDesc" TEXT,
    "colorType" TEXT,
    "styleCategory" TEXT,
    "styleCatDesc" TEXT,
    "warehouse" TEXT,
    "movementType" TEXT,
    "movementDate" DATETIME,
    "user" TEXT,
    "group" TEXT,
    "groupDesc" TEXT,
    "reference" TEXT,
    "customerVendor" TEXT,
    "reasonCode" TEXT,
    "reasonDesc" TEXT,
    "costPrice" REAL NOT NULL DEFAULT 0,
    "wholesalePrice" REAL NOT NULL DEFAULT 0,
    "msrp" REAL NOT NULL DEFAULT 0,
    "sizePricing" TEXT,
    "division" TEXT,
    "divisionDesc" TEXT,
    "label" TEXT,
    "labelDesc" TEXT,
    "period" TEXT,
    "qty" INTEGER NOT NULL DEFAULT 0,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "extension" REAL NOT NULL DEFAULT 0,
    "prodMgr" TEXT,
    "oldStyleNumber" TEXT,
    "pantoneCsiDesc" TEXT,
    "controlNumber" TEXT,
    "asnStatus" TEXT,
    "store" TEXT,
    "salesOrderNumber" TEXT,
    "segmentCode" TEXT,
    "segmentDesc" TEXT,
    "costCode" TEXT,
    "costDesc" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Product_season_idx" ON "Product"("season");

-- CreateIndex
CREATE INDEX "Product_styleNumber_idx" ON "Product"("styleNumber");

-- CreateIndex
CREATE INDEX "Product_divisionDesc_idx" ON "Product"("divisionDesc");

-- CreateIndex
CREATE INDEX "Product_categoryDesc_idx" ON "Product"("categoryDesc");

-- CreateIndex
CREATE UNIQUE INDEX "Product_styleNumber_color_season_key" ON "Product"("styleNumber", "color", "season");

-- CreateIndex
CREATE INDEX "Sale_season_idx" ON "Sale"("season");

-- CreateIndex
CREATE INDEX "Sale_styleNumber_idx" ON "Sale"("styleNumber");

-- CreateIndex
CREATE INDEX "Sale_customer_idx" ON "Sale"("customer");

-- CreateIndex
CREATE INDEX "Sale_customerType_idx" ON "Sale"("customerType");

-- CreateIndex
CREATE INDEX "Sale_invoiceDate_idx" ON "Sale"("invoiceDate");

-- CreateIndex
CREATE INDEX "Sale_accountingPeriod_idx" ON "Sale"("accountingPeriod");

-- CreateIndex
CREATE INDEX "Sale_shipToState_idx" ON "Sale"("shipToState");

-- CreateIndex
CREATE INDEX "Pricing_season_idx" ON "Pricing"("season");

-- CreateIndex
CREATE INDEX "Pricing_styleNumber_idx" ON "Pricing"("styleNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Pricing_styleNumber_colorCode_season_key" ON "Pricing"("styleNumber", "colorCode", "season");

-- CreateIndex
CREATE INDEX "Cost_season_idx" ON "Cost"("season");

-- CreateIndex
CREATE INDEX "Cost_styleNumber_idx" ON "Cost"("styleNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Cost_styleNumber_season_key" ON "Cost"("styleNumber", "season");

-- CreateIndex
CREATE UNIQUE INDEX "Season_code_key" ON "Season"("code");

-- CreateIndex
CREATE INDEX "Season_code_idx" ON "Season"("code");

-- CreateIndex
CREATE INDEX "Season_status_idx" ON "Season"("status");

-- CreateIndex
CREATE INDEX "Inventory_styleNumber_idx" ON "Inventory"("styleNumber");

-- CreateIndex
CREATE INDEX "Inventory_color_idx" ON "Inventory"("color");

-- CreateIndex
CREATE INDEX "Inventory_warehouse_idx" ON "Inventory"("warehouse");

-- CreateIndex
CREATE INDEX "Inventory_movementType_idx" ON "Inventory"("movementType");

-- CreateIndex
CREATE INDEX "Inventory_movementDate_idx" ON "Inventory"("movementDate");

-- CreateIndex
CREATE INDEX "Inventory_period_idx" ON "Inventory"("period");

-- CreateIndex
CREATE INDEX "Inventory_customerVendor_idx" ON "Inventory"("customerVendor");
