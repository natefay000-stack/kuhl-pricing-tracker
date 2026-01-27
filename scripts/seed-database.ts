/**
 * Database Seed Script
 *
 * This script reads the Excel files from /data and populates the PostgreSQL database.
 * Run with: npx ts-node scripts/seed-database.ts
 *
 * Make sure DATABASE_URL is set in .env before running.
 */

import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const DATA_DIR = path.join(process.cwd(), 'data');

// File names
const LINE_LIST_FILE = 'FC LL 1.23.2026.xlsx';
const SALES_FILE = '26FA sales data 1.23.2026.xlsx';
const PRICING_FILE = 'pricebyseason1.23.26.xlsx';
const COSTS_FILE = 'Landed Request Sheet.xlsx';

function parseString(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function parseNumber(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  const num = parseFloat(String(val).replace(/[$,]/g, ''));
  return isNaN(num) ? 0 : num;
}

function normalizeSeasonCode(raw: string): { season: string; seasonType: string } {
  if (!raw) return { season: '', seasonType: 'Main' };

  let s = raw.toUpperCase().trim();
  let seasonType = 'Main';

  if (s.includes('BULK')) {
    seasonType = 'Bulk';
    s = s.replace(/[\s-]*BULK/gi, '').trim();
  } else if (s.includes('PROTO')) {
    seasonType = 'Proto';
    s = s.replace(/[\s-]*PROTO/gi, '').trim();
  }

  if (s.includes('/')) {
    s = s.split('/')[0].trim();
  }

  s = s.replace(/[^A-Z0-9]/g, '');

  let normalized = '';

  // FA## or SP##
  let match = s.match(/^(FA|SP)(\d{2})$/);
  if (match) normalized = `${match[2]}${match[1]}`;

  // ##FA or ##SP
  if (!normalized) {
    match = s.match(/^(\d{2})(FA|SP)$/);
    if (match) normalized = `${match[1]}${match[2]}`;
  }

  return { season: normalized || s, seasonType };
}

async function seedProducts() {
  const filePath = path.join(DATA_DIR, LINE_LIST_FILE);
  if (!fs.existsSync(filePath)) {
    console.log('Line list file not found:', filePath);
    return 0;
  }

  console.log('Loading products from:', LINE_LIST_FILE);
  const buffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];

  console.log(`Processing ${rows.length} product rows...`);

  // Clear existing products
  await prisma.product.deleteMany();

  const batchSize = 1000;
  let count = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
      .filter(row => parseString(row['Style#'] || row['Style'] || row['Style #']))
      .map((row) => {
        const { season, seasonType } = normalizeSeasonCode(parseString(row['Seas'] || row['Season']));
        return {
          styleNumber: parseString(row['Style#'] || row['Style'] || row['Style #']),
          styleDesc: parseString(row['Style Desc'] || row['Style Description']),
          color: parseString(row['Clr'] || row['Color']),
          colorDesc: parseString(row['Clr Desc'] || row['Color Desc']),
          styleColor: parseString(row['Style/Color'] || row['Style-Clr']),
          season,
          seasonType,
          divisionDesc: parseString(row['Division Desc'] || row['Div Desc']),
          categoryDesc: parseString(row['Cat Desc'] || row['Category Description']),
          category: parseString(row['Category']),
          productLine: parseString(row['Product Line']),
          productLineDesc: parseString(row['Product Line Desc']),
          labelDesc: parseString(row['Label Desc']),
          designerName: parseString(row['Designer Name'] || row['Designer']),
          techDesignerName: parseString(row['Tech Designer Name'] || row['Tech Designer']),
          countryOfOrigin: parseString(row['Country of Origin Description']),
          factoryName: parseString(row['Factory Description']),
          msrp: parseNumber(row['MSRP'] || row['MSRP (Style)']),
          price: parseNumber(row['Price'] || row['Wholesale Price']),
          cost: parseNumber(row['Cost']),
          cadMsrp: row['CAD-MSRP'] ? parseNumber(row['CAD-MSRP']) : null,
          cadPrice: row['CAD-Price'] ? parseNumber(row['CAD-Price']) : null,
          carryOver: parseString(row['Carry Over'] || row['C/O']).toUpperCase() === 'Y',
          carryForward: parseString(row['Carry Forward']).toUpperCase() === 'Y',
          sellingSeasons: parseString(row['Selling Seasons']),
          htsCode: parseString(row['HTS Code']),
          styleColorNotes: parseString(row['Style/Color Notes']),
        };
      });

    if (batch.length > 0) {
      await prisma.product.createMany({ data: batch, skipDuplicates: true });
      count += batch.length;
      console.log(`  Imported ${count} products...`);
    }
  }

  return count;
}

async function seedSales() {
  const filePath = path.join(DATA_DIR, SALES_FILE);
  if (!fs.existsSync(filePath)) {
    console.log('Sales file not found:', filePath);
    return 0;
  }

  console.log('Loading sales from:', SALES_FILE);
  const buffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames.includes('Sheet1') ? 'Sheet1' : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];

  console.log(`Processing ${rows.length} sales rows...`);

  // Clear existing sales
  await prisma.sale.deleteMany();

  const batchSize = 1000;
  let count = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
      .filter(row => parseString(row['Style']))
      .map((row) => {
        const { season, seasonType } = normalizeSeasonCode(parseString(row['Season']));
        return {
          styleNumber: parseString(row['Style']),
          styleDesc: parseString(row['Style Description']),
          colorCode: parseString(row['Color']),
          colorDesc: parseString(row['Color Desc. From Clr Mst']),
          season,
          seasonType,
          customer: parseString(row['Customer Name']),
          customerType: parseString(row['Customer Type']),
          salesRep: parseString(row['Sales Rep 1']),
          divisionDesc: parseString(row['Division']),
          categoryDesc: parseString(row['Category Description']),
          gender: parseString(row['Gender Descripton']),
          unitsBooked: Math.round(parseNumber(row['Units Current Booked'])),
          unitsOpen: Math.round(parseNumber(row['Units Open'])),
          revenue: parseNumber(row['$ Current Booked Net']),
          shipped: parseNumber(row['$ Shipped Net']),
          cost: parseNumber(row['Cost']),
          wholesalePrice: parseNumber(row['Wholesale Price']),
          msrp: parseNumber(row['MSRP (Style)']),
          netUnitPrice: parseNumber(row['Net Unit Price']),
          orderType: parseString(row['Order Type']),
        };
      });

    if (batch.length > 0) {
      await prisma.sale.createMany({ data: batch });
      count += batch.length;
      console.log(`  Imported ${count} sales...`);
    }
  }

  return count;
}

async function seedPricing() {
  const filePath = path.join(DATA_DIR, PRICING_FILE);
  if (!fs.existsSync(filePath)) {
    console.log('Pricing file not found:', filePath);
    return 0;
  }

  console.log('Loading pricing from:', PRICING_FILE);
  const buffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];

  console.log(`Processing ${rows.length} pricing rows...`);

  // Clear existing pricing
  await prisma.pricing.deleteMany();

  const batchSize = 1000;
  let count = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
      .filter(row => parseString(row['Style'] || row['Style #']))
      .map((row) => {
        const { season, seasonType } = normalizeSeasonCode(parseString(row['Season']));
        return {
          styleNumber: parseString(row['Style'] || row['Style #']),
          styleDesc: parseString(row['Description'] || row['Style Desc']),
          colorCode: parseString(row['Clr']),
          colorDesc: parseString(row['Clr_Desc'] || row['Clr Desc']),
          season,
          seasonType,
          seasonDesc: parseString(row['Sea Desc']),
          price: parseNumber(row['Price'] || row['Wholesale']),
          msrp: parseNumber(row['MSRP'] || row['Retail']),
          cost: parseNumber(row['Cost']),
        };
      });

    if (batch.length > 0) {
      await prisma.pricing.createMany({ data: batch, skipDuplicates: true });
      count += batch.length;
      console.log(`  Imported ${count} pricing records...`);
    }
  }

  return count;
}

async function seedCosts() {
  const filePath = path.join(DATA_DIR, COSTS_FILE);
  if (!fs.existsSync(filePath)) {
    console.log('Costs file not found:', filePath);
    return 0;
  }

  console.log('Loading costs from:', COSTS_FILE);
  const buffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames.includes('LDP Requests') ? 'LDP Requests' : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { range: 10, defval: '' }) as Record<string, unknown>[];

  console.log(`Processing ${rows.length} cost rows...`);

  // Clear existing costs
  await prisma.cost.deleteMany();

  const batchSize = 1000;
  let count = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
      .filter(row => parseString(row['Style #'] || row['Style']))
      .map((row) => {
        const { season, seasonType } = normalizeSeasonCode(parseString(row['Season']));
        return {
          styleNumber: parseString(row['Style #'] || row['Style']),
          styleName: parseString(row['Style Name'] || row['Description']),
          season,
          seasonType,
          factory: parseString(row['Factory']),
          countryOfOrigin: parseString(row['COO'] || row['Country']),
          designTeam: parseString(row['Design Team']),
          developer: parseString(row['Developer/ Designer'] || row['Developer']),
          fob: parseNumber(row['FOB']),
          landed: parseNumber(row['Landed'] || row['LDP']),
          dutyCost: parseNumber(row['Duty Cost $'] || row['Duty']),
          tariffCost: parseNumber(row['Tariff  Cost $'] || row['Tariff Cost $'] || row['Tariff']),
          freightCost: parseNumber(row['Freight Cost'] || row['Freight']),
          overheadCost: parseNumber(row['Overhead Cost'] || row['Overhead']),
          suggestedMsrp: row['Suggested MSRP'] ? parseNumber(row['Suggested MSRP']) : null,
          suggestedWholesale: row['Suggested Selling Price'] ? parseNumber(row['Suggested Selling Price']) : null,
          margin: row['Margin'] ? parseNumber(row['Margin']) : null,
        };
      });

    if (batch.length > 0) {
      await prisma.cost.createMany({ data: batch, skipDuplicates: true });
      count += batch.length;
      console.log(`  Imported ${count} cost records...`);
    }
  }

  return count;
}

async function main() {
  console.log('='.repeat(60));
  console.log('KÜHL Database Seed Script');
  console.log('='.repeat(60));
  console.log('');

  try {
    console.log('Connecting to database...');
    await prisma.$connect();
    console.log('Connected!\n');

    const productCount = await seedProducts();
    console.log(`✓ Imported ${productCount} products\n`);

    const salesCount = await seedSales();
    console.log(`✓ Imported ${salesCount} sales records\n`);

    const pricingCount = await seedPricing();
    console.log(`✓ Imported ${pricingCount} pricing records\n`);

    const costCount = await seedCosts();
    console.log(`✓ Imported ${costCount} cost records\n`);

    // Log the import
    await prisma.importLog.create({
      data: {
        fileName: 'seed-database.ts',
        fileType: 'seed',
        recordCount: productCount + salesCount + pricingCount + costCount,
      },
    });

    console.log('='.repeat(60));
    console.log('Seed Complete!');
    console.log('='.repeat(60));
    console.log(`Products: ${productCount}`);
    console.log(`Sales: ${salesCount}`);
    console.log(`Pricing: ${pricingCount}`);
    console.log(`Costs: ${costCount}`);
    console.log(`Total: ${productCount + salesCount + pricingCount + costCount}`);

  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
