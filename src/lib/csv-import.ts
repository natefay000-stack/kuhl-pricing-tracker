import Papa from 'papaparse';
import { Product, CSV_HEADER_MAP } from '@/types/product';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export interface ImportResult {
  success: boolean;
  products: Product[];
  errors: string[];
  rowCount: number;
  importedCount: number;
}

function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  const lower = value.toLowerCase().trim();
  return lower === 'yes' || lower === 'true' || lower === '1' || lower === 'y';
}

function parseNumber(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.replace(/[$,]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseNullableNumber(value: string | undefined): number | null {
  if (!value || value.trim() === '') return null;
  const cleaned = value.replace(/[$,]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseDate(value: string | undefined): string | null {
  if (!value || value.trim() === '') return null;
  // Try to parse the date and return ISO format
  const date = new Date(value);
  return isNaN(date.getTime()) ? value : date.toISOString().split('T')[0];
}

export function parseCSV(file: File): Promise<ImportResult> {
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const products: Product[] = [];
        const errors: string[] = [];
        
        results.data.forEach((row: any, index: number) => {
          try {
            // Map CSV columns to product fields - supporting multiple header formats
            const product: Product = {
              id: generateId(),
              // Style number - try multiple possible headers
              styleNumber: row['Style'] || row['Style#'] || row['Style #'] || row['StyleNumber'] || '',
              // Description
              styleDesc: row['Description'] || row['Style Desc'] || row['Style Description'] || row['StyleDesc'] || '',
              // Color
              color: row['Clr'] || row['Color'] || '',
              colorDesc: row['Clr_Desc'] || row['Clr Desc'] || row['Color Desc'] || row['Color Description'] || '',
              // Style/Color combo
              styleColor: row['Style/Color'] || row['StyleColor'] || '',
              // Division & Category
              divisionDesc: row['Division Desc'] || row['Division'] || '',
              categoryDesc: row['Cat Desc'] || row['Category Desc'] || row['Category Description'] || '',
              // Season info
              styleSeason: row['StySea'] || row['Style Season'] || '',
              colorSeason: row['ClrSea'] || row['Color Season'] || '',
              season: row['Season'] || row['Seas'] || '',
              seasonDesc: row['Sea Desc'] || row['Season Desc'] || '',
              // Carry over
              carryOver: parseBoolean(row['Carry Over'] || row['CarryOver']),
              carryForward: parseBoolean(row['Carry Forward'] || row['CarryForward']),
              // Segment
              styleSegmentDesc: row['Style Segment Desc.'] || row['Style Segment Desc'] || '',
              styleSegment: row['Style Segment'] || '',
              // Pricing - Price is wholesale, MSRP is retail
              price: parseNumber(row['Price'] || row['Wholesale']),
              msrp: parseNumber(row['MSRP'] || row['Retail']),
              cost: parseNumber(row['Cost']), // May be 0 if not provided
              // Dates
              dateAddedColor: parseDate(row['Date Added (Color)'] || row['Date Added Color']),
              dateChangedColor: parseDate(row['Date Changed (Color)'] || row['Date Changed Color']),
              dateChangedStyle: parseDate(row['Date Changed (Style)'] || row['Date Changed Style']),
              dateOpened: parseDate(row['Date Opened']),
              // Classification
              inventoryClassification: row['Inventory Classification'] || '',
              inventoryClassificationDesc: row['Inventory Classification Desc.'] || row['Inventory Classification Desc'] || '',
              // Notes
              styleColorNotes: row['Style/Color Notes'] || row['Notes'] || '',
              // Currency
              currency: row['Currency'] || row['Curr'] || 'USD',
              sellingSeasons: row['Selling Seasons'] || '',
              // CAD pricing
              cadLastCostSheet: parseNullableNumber(row['CAD-Last Cost Sheet']),
              cadPrice: parseNullableNumber(row['CAD-Price']),
              cadMsrp: parseNullableNumber(row['CAD-MSRP']),
              // Product line
              productLine: row['Product Line'] || '',
              productLineDesc: row['Product Line Desc'] || '',
              // People
              techDesignerName: row['Tech Designer Name'] || row['Tech Designer'] || '',
              category: row['Category'] || '',
              designerName: row['Designer Name'] || row['Designer'] || '',
              labelDesc: row['Label Desc'] || row['Label'] || '',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            
            // Generate styleColor if not present - include season for uniqueness across seasons
            if (!product.styleColor) {
              const seasonPart = product.season ? `${product.season}-` : '';
              if (product.styleNumber && product.color) {
                product.styleColor = `${seasonPart}${product.styleNumber}-${product.color}`;
              } else if (product.styleNumber) {
                // Use style number alone when no color
                product.styleColor = `${seasonPart}${product.styleNumber}`;
              }
            }
            
            // Only add products with at least style number
            if (product.styleNumber) {
              products.push(product);
            } else {
              errors.push(`Row ${index + 2}: Missing style number`);
            }
          } catch (err) {
            errors.push(`Row ${index + 2}: ${err instanceof Error ? err.message : 'Parse error'}`);
          }
        });
        
        resolve({
          success: errors.length === 0,
          products,
          errors,
          rowCount: results.data.length,
          importedCount: products.length,
        });
      },
      error: (error) => {
        resolve({
          success: false,
          products: [],
          errors: [error.message],
          rowCount: 0,
          importedCount: 0,
        });
      },
    });
  });
}

export function exportToCSV(products: Product[]): string {
  const headers = [
    'Style#', 'Style Desc', 'Clr', 'Clr Desc', 'Style/Color',
    'Division Desc', 'Cat Desc', 'StySea', 'ClrSea', 'Carry Over',
    'Carry Forward', 'Season', 'Style Segment Desc.', 'Style Segment',
    'Price', 'MSRP', 'Cost', 'Date Added (Color)', 'Date Changed (Color)',
    'Date Changed (Style)', 'Date Opened', 'Inventory Classification',
    'Inventory Classification Desc.', 'Style/Color Notes', 'Curr',
    'Selling Seasons', 'CAD-Last Cost Sheet', 'CAD-Price', 'CAD-MSRP',
    'Product Line', 'Product Line Desc', 'Tech Designer Name',
    'Category', 'Designer Name', 'Label Desc'
  ];
  
  const rows = products.map(p => [
    p.styleNumber, p.styleDesc, p.color, p.colorDesc, p.styleColor,
    p.divisionDesc, p.categoryDesc, p.styleSeason, p.colorSeason,
    p.carryOver ? 'Yes' : 'No', p.carryForward ? 'Yes' : 'No',
    p.season, p.styleSegmentDesc, p.styleSegment,
    p.price, p.msrp, p.cost, p.dateAddedColor || '', p.dateChangedColor || '',
    p.dateChangedStyle || '', p.dateOpened || '', p.inventoryClassification,
    p.inventoryClassificationDesc, p.styleColorNotes, p.currency,
    p.sellingSeasons, p.cadLastCostSheet || '', p.cadPrice || '', p.cadMsrp || '',
    p.productLine, p.productLineDesc, p.techDesignerName,
    p.category, p.designerName, p.labelDesc
  ]);
  
  return Papa.unparse({ fields: headers, data: rows });
}
