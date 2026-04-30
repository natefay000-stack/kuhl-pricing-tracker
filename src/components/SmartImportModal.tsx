'use client';

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { generateSeasonOptions } from '@/utils/season';
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  Loader2,
  ChevronDown,
  Eye,
  EyeOff,
  AlertTriangle,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import { FileType, detectFileType } from '@/lib/file-detection';
import * as XLSX from 'xlsx';
import {
  parseSalesXLSX,
  parseLineListXLSX,
  parseLandedSheetXLSX,
  parsePricingXLSX,
  mergeSeasonData,
  convertToAppFormats,
} from '@/lib/xlsx-import';
import { normalizeCategory } from '@/types/product';

type ModalState = 'drop' | 'detecting' | 'confirm' | 'importing' | 'complete';
type MultiFileState = 'queue' | 'importing' | 'complete';

interface DetectionResult {
  filename: string;
  fileSize: string;
  detectedType: FileType;
  confidence: 'high' | 'medium' | 'low';
  matchedColumns: string[];
  allColumns: string[];
  recordCount: number;
  detectedSeason: string | null;
  previewRows: Record<string, unknown>[];
}

interface MultiFileItem {
  file: File;
  filename: string;
  fileSize: string;
  season: string | null;
  seasonSource: 'filename' | 'content' | 'unknown';
  recordCount: number;
  status: 'pending' | 'detecting' | 'ready' | 'importing' | 'complete' | 'error';
  progress: number;
  error?: string;
  importedCount?: number;
}

interface ImportResult {
  added: number;
  updated: number;
  summary: string;
}

interface SmartImportModalProps {
  existingSeasons: string[];
  onImport: (data: {
    products: Record<string, unknown>[];
    pricing: Record<string, unknown>[];
    costs: Record<string, unknown>[];
    sales: Record<string, unknown>[];
    season: string;
  }) => void;
  onImportSalesOnly: (data: {
    sales: Record<string, unknown>[];
  }) => void;
  onImportMultiSeason: (data: {
    products?: Record<string, unknown>[];
    pricing?: Record<string, unknown>[];
    costs?: Record<string, unknown>[];
    inventory?: Record<string, unknown>[];
  }) => void;
  onImportSalesReplace: (data: {
    sales: Record<string, unknown>[];
    seasons: string[];
  }) => void;
  onImportInvoice: (data: {
    invoices: Record<string, unknown>[];
    seasons: string[];
  }) => void;
  onImportDirectToDb?: () => void; // Called when large files are imported directly to DB — triggers a data refresh
  onClose: () => void;
}

// Dynamically generated based on current date — no hardcoded years
const AVAILABLE_SEASONS = generateSeasonOptions();

const FILE_TYPE_LABELS: Record<FileType, string> = {
  lineList: 'Line List',
  costs: 'Landed Costs',
  sales: 'Sales Data',
  invoice: 'Invoice Data',
  pricing: 'Pricing',
  inventory: 'Inventory',
  unknown: 'Unknown',
};

// Extract season from filename pattern: "24SP SALES...", "26FA SALES..."
function extractSeasonFromFilename(filename: string): string | null {
  const match = filename.match(/^(\d{2}(?:SP|FA))\s+SALES/i);
  if (match) {
    return match[1].toUpperCase();
  }
  return null;
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export default function SmartImportModal({
  existingSeasons,
  onImport,
  onImportSalesOnly,
  onImportMultiSeason,
  onImportSalesReplace,
  onImportInvoice,
  onImportDirectToDb,
  onClose,
}: SmartImportModalProps) {
  // Single file state
  const [state, setState] = useState<ModalState>('drop');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [selectedType, setSelectedType] = useState<FileType>('unknown');
  const [selectedSeason, setSelectedSeason] = useState<string>('27SP');
  const [showPreview, setShowPreview] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Overwrite warning state
  const [overwriteCheck, setOverwriteCheck] = useState<{
    existingCount: number;
    warning: string | null;
    lastImport: { fileName: string; recordCount: number; importedAt: string } | null;
  } | null>(null);
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false);

  // Multi-file state
  const [multiFileMode, setMultiFileMode] = useState(false);
  const [multiFileState, setMultiFileState] = useState<MultiFileState>('queue');
  const [multiFiles, setMultiFiles] = useState<MultiFileItem[]>([]);
  const [multiFileTotalRecords, setMultiFileTotalRecords] = useState(0);

  // Check for existing data when entering confirm state
  useEffect(() => {
    if (state !== 'confirm' || !selectedType || selectedType === 'unknown') {
      setOverwriteCheck(null);
      setOverwriteConfirmed(false);
      return;
    }

    const params = new URLSearchParams({ type: selectedType });
    if (selectedSeason && selectedType === 'lineList') {
      params.set('season', selectedSeason);
    }

    fetch(`/api/import-check?${params}`)
      .then(r => r.json())
      .then(data => {
        if (data.existingCount > 0) {
          setOverwriteCheck(data);
          setOverwriteConfirmed(false);
        } else {
          setOverwriteCheck(null);
          setOverwriteConfirmed(true);
        }
      })
      .catch(() => {
        // If check fails, don't block the import
        setOverwriteCheck(null);
        setOverwriteConfirmed(true);
      });
  }, [state, selectedType, selectedSeason]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);

    // Filter to only Excel files
    const excelFiles = files.filter(f => f.name.match(/\.(xlsx|xls)$/i));

    if (excelFiles.length === 0) {
      setError('Please select Excel files (.xlsx or .xls)');
      return;
    }

    if (excelFiles.length === 1) {
      // Single file mode
      handleFileSelect(excelFiles[0]);
    } else {
      // Multi-file mode
      handleMultiFileSelect(excelFiles);
    }
  }, []);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const excelFiles = Array.from(files).filter(f => f.name.match(/\.(xlsx|xls)$/i));

      if (excelFiles.length === 1) {
        handleFileSelect(excelFiles[0]);
      } else if (excelFiles.length > 1) {
        handleMultiFileSelect(excelFiles);
      }
    }
  };

  // Multi-file selection handler
  const handleMultiFileSelect = async (files: File[]) => {
    setMultiFileMode(true);
    setError(null);

    // Initialize file items
    const items: MultiFileItem[] = files.map(file => ({
      file,
      filename: file.name,
      fileSize: formatFileSize(file.size),
      season: extractSeasonFromFilename(file.name),
      seasonSource: extractSeasonFromFilename(file.name) ? 'filename' : 'unknown',
      recordCount: 0,
      status: 'pending',
      progress: 0,
    }));

    setMultiFiles(items);

    // Detect each file
    for (let i = 0; i < items.length; i++) {
      setMultiFiles(prev => prev.map((item, idx) =>
        idx === i ? { ...item, status: 'detecting' } : item
      ));

      try {
        // Client-side detection to avoid Vercel 4.5MB body limit
        const buffer = await items[i].file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames.includes('Sheet1') ? 'Sheet1' : workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
        const totalRows = range.e.r - range.s.r;
        const rows = XLSX.utils.sheet_to_json(sheet, {
          defval: '',
          range: { s: { r: 0, c: 0 }, e: { r: 20, c: range.e.c } },
        }) as Record<string, unknown>[];
        const cleanedRows = rows.filter(row => {
          const keys = Object.keys(row).filter(k => !k.startsWith('__EMPTY'));
          return keys.some(k => row[k] !== '' && row[k] !== null && row[k] !== undefined);
        });
        if (cleanedRows.length === 0) throw new Error('File appears empty');
        const headers = Object.keys(cleanedRows[0]).filter(h => !h.startsWith('__EMPTY'));
        const det = detectFileType(headers);
        const detectedSeason = extractSeasonFromFilename(items[i].file.name);
        const result = {
          success: true,
          detectedType: det.type,
          recordCount: totalRows,
          detectedSeason,
        };

        // Check if it's a sales or invoice file
        if (result.detectedType !== 'sales' && result.detectedType !== 'invoice') {
          throw new Error(`Expected Sales/Invoice Data, got ${FILE_TYPE_LABELS[result.detectedType as FileType]}`);
        }

        // Update with detection results
        setMultiFiles(prev => prev.map((item, idx) => {
          if (idx === i) {
            const detectedSeason = item.season || result.detectedSeason;
            return {
              ...item,
              status: detectedSeason ? 'ready' : 'error',
              recordCount: result.recordCount || 0,
              season: detectedSeason,
              seasonSource: item.season ? 'filename' : (result.detectedSeason ? 'content' : 'unknown'),
              error: !detectedSeason ? 'Could not detect season' : undefined,
            };
          }
          return item;
        }));
      } catch (err) {
        setMultiFiles(prev => prev.map((item, idx) =>
          idx === i ? {
            ...item,
            status: 'error',
            error: err instanceof Error ? err.message : 'Detection failed'
          } : item
        ));
      }
    }
  };

  // Validate multi-file queue
  const validateMultiFiles = (): { valid: boolean; error?: string } => {
    const readyFiles = multiFiles.filter(f => f.status === 'ready');

    if (readyFiles.length === 0) {
      return { valid: false, error: 'No valid files to import' };
    }

    // Check for duplicate seasons
    const seasons = readyFiles.map(f => f.season);
    const duplicates = seasons.filter((s, i) => seasons.indexOf(s) !== i);

    if (duplicates.length > 0) {
      return { valid: false, error: `Duplicate seasons found: ${Array.from(new Set(duplicates)).join(', ')}` };
    }

    return { valid: true };
  };

  // Multi-file import handler
  const handleMultiFileImport = async () => {
    const validation = validateMultiFiles();
    if (!validation.valid) {
      setError(validation.error || 'Validation failed');
      return;
    }

    setMultiFileState('importing');
    setError(null);

    const readyFiles = multiFiles.filter(f => f.status === 'ready');
    const allSales: Record<string, unknown>[] = [];
    const allSeasons: string[] = [];

    // Process files sequentially — parse each client-side to avoid Vercel body limits
    for (let i = 0; i < readyFiles.length; i++) {
      const fileItem = readyFiles[i];
      const fileIndex = multiFiles.findIndex(f => f.filename === fileItem.filename);

      // Update status to importing
      setMultiFiles(prev => prev.map((item, idx) =>
        idx === fileIndex ? { ...item, status: 'importing', progress: 0 } : item
      ));

      try {
        // Parse client-side (same as single-file flow)
        const buffer = await fileItem.file.arrayBuffer();
        setMultiFiles(prev => prev.map((item, idx) =>
          idx === fileIndex ? { ...item, progress: 30 } : item
        ));

        const salesData = parseSalesXLSX(buffer);
        setMultiFiles(prev => prev.map((item, idx) =>
          idx === fileIndex ? { ...item, progress: 70 } : item
        ));

        const salesAppData = salesData.map((s, sIdx) => ({
          id: `sale-mf-${i}-${sIdx}`,
          styleNumber: s.styleNumber,
          styleDesc: s.styleDesc,
          colorCode: s.colorCode,
          colorDesc: s.colorDesc,
          season: s.season,
          seasonType: 'Main',
          customer: s.customer,
          customerType: s.customerType,
          unitsBooked: s.unitsBooked,
          unitsOpen: s.unitsOpen || 0,
          revenue: s.revenue,
          shipped: s.shipped || 0,
          cost: s.cost || 0,
          wholesalePrice: s.wholesalePrice || 0,
          msrp: s.msrp || 0,
          netUnitPrice: s.netUnitPrice || (s.unitsBooked > 0 ? s.revenue / s.unitsBooked : 0),
          divisionDesc: s.divisionDesc,
          categoryDesc: normalizeCategory(s.categoryDesc),
          gender: s.gender || '',
          salesRep: s.salesRep || '',
          orderType: s.orderType || '',
          invoiceDate: s.invoiceDate || null,
          accountingPeriod: s.accountingPeriod || null,
          invoiceNumber: s.invoiceNumber || null,
          shipToState: s.shipToState || null,
          returnedAtNet: s.returnedAtNet || 0,
          shippedAtNet: s.shippedAtNet || 0,
          totalPrice: s.totalPrice || 0,
          commissionRate: s.commissionRate || 0,
          ytdNetInvoicing: s.ytdNetInvoicing || 0,
          ytdCreditMemos: s.ytdCreditMemos || 0,
          ytdSales: s.ytdSales || 0,
          warehouse: s.warehouse || null,
          warehouseDesc: s.warehouseDesc || null,
          openAtNet: s.openAtNet || 0,
          openOrder: s.openOrder || 0,
          returned: s.returned || 0,
          shippedAtMsrp: s.shippedAtMsrp || 0,
          totalAtNet: s.totalAtNet || 0,
          totalAtWholesale: s.totalAtWholesale || 0,
          returnedAtWholesale: s.returnedAtWholesale || 0,
          shipToCity: s.shipToCity || null,
          shipToZip: s.shipToZip || null,
          billToState: s.billToState || null,
          billToCity: s.billToCity || null,
          billToZip: s.billToZip || null,
          unitsShipped: s.unitsShipped || 0,
          unitsReturned: s.unitsReturned || 0,
        }));

        if (salesAppData.length > 0) {
          allSales.push(...salesAppData);

          // Extract seasons from records
          const recordSeasons = salesAppData
            .map((s) => s.season as string)
            .filter((s: string) => s && s.length > 0);

          if (recordSeasons.length > 0) {
            allSeasons.push(...recordSeasons);
          } else if (fileItem.season) {
            allSeasons.push(fileItem.season);
          }
        }

        console.log(`Multi-file: parsed ${fileItem.filename} client-side:`, salesAppData.length, 'records');

        // Update status to complete
        setMultiFiles(prev => prev.map((item, idx) =>
          idx === fileIndex ? {
            ...item,
            status: 'complete',
            progress: 100,
            importedCount: salesAppData.length,
          } : item
        ));

      } catch (err) {
        setMultiFiles(prev => prev.map((item, idx) =>
          idx === fileIndex ? {
            ...item,
            status: 'error',
            error: err instanceof Error ? err.message : 'Import failed',
          } : item
        ));
      }
    }

    // Call the replace handler with all client-side sales data
    if (allSales.length > 0) {
      onImportSalesReplace({
        sales: allSales,
        seasons: Array.from(new Set(allSeasons)),
      });
    }

    setMultiFileTotalRecords(allSales.length);
    setMultiFileState('complete');
  };

  const handleFileSelect = async (file: File) => {
    // Validate file type
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setError('Please select an Excel file (.xlsx or .xls)');
      return;
    }

    setSelectedFile(file);
    setError(null);
    setState('detecting');

    try {
      // Parse the file client-side to avoid Vercel's 4.5MB body size limit
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });

      // Pick the best sheet
      let sheetName = workbook.SheetNames[0];
      if (workbook.SheetNames.includes('Line List')) {
        sheetName = 'Line List';
      } else if (workbook.SheetNames.includes('Sheet1')) {
        sheetName = 'Sheet1';
      } else if (workbook.SheetNames.includes('LDP Requests')) {
        sheetName = 'LDP Requests';
      }

      const sheet = workbook.Sheets[sheetName];
      const isLDPSheet = sheetName === 'LDP Requests';

      // Only parse first 20 rows for detection
      const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
      const totalRows = range.e.r - range.s.r;
      const startRow = isLDPSheet ? 10 : 0;
      const rows = XLSX.utils.sheet_to_json(sheet, {
        defval: '',
        range: { s: { r: startRow, c: 0 }, e: { r: startRow + 20, c: range.e.c } },
      }) as Record<string, unknown>[];

      const cleanedRows = rows.filter(row => {
        const keys = Object.keys(row).filter(k => !k.startsWith('__EMPTY'));
        return keys.some(k => row[k] !== '' && row[k] !== null && row[k] !== undefined);
      });

      if (cleanedRows.length === 0) {
        throw new Error('File appears to be empty or has no data rows');
      }

      const allHeaders = Object.keys(cleanedRows[0]);
      const headers = allHeaders.filter(h => !h.startsWith('__EMPTY'));

      const detection = detectFileType(headers);
      const detectedSeason = extractSeasonFromFilename(file.name);
      const previewRows = cleanedRows.slice(0, 5);
      const recordCount = Math.max(totalRows - startRow, cleanedRows.length);

      const result = {
        filename: file.name,
        fileSize: formatFileSize(file.size),
        detectedType: detection.type,
        confidence: detection.confidence,
        matchedColumns: detection.matchedColumns,
        allColumns: detection.allColumns,
        recordCount,
        detectedSeason,
        previewRows,
        success: true,
      };

      setDetection(result);
      setSelectedType(result.detectedType);

      if (result.detectedSeason) {
        setSelectedSeason(result.detectedSeason);
      }

      setState('confirm');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze file');
      setState('drop');
    }
  };

  const handleImport = async () => {
    if (!selectedFile || !detection) return;

    setState('importing');
    setImportProgress(10);
    setError(null);

    try {
      // Parse the file entirely client-side to avoid Vercel's 4.5MB body limit
      const buffer = await selectedFile.arrayBuffer();
      setImportProgress(30);

      let data: Record<string, unknown> = {};

      if (selectedType === 'sales' || selectedType === 'invoice') {
        const salesData = parseSalesXLSX(buffer);
        console.log(`Parsed ${selectedType} client-side:`, salesData.length, 'records');

        const seasonCounts: Record<string, number> = {};
        for (const s of salesData) {
          const season = s.season || 'Unknown';
          seasonCounts[season] = (seasonCounts[season] || 0) + 1;
        }
        const seasons = Object.keys(seasonCounts).filter(s => s !== 'Unknown');
        const seasonSummary = Object.entries(seasonCounts)
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([s, count]) => `${s}: ${count.toLocaleString()}`)
          .join(', ');

        const salesAppData = salesData.map((s, index) => ({
          id: `sale-${index}`,
          styleNumber: s.styleNumber,
          styleDesc: s.styleDesc,
          colorCode: s.colorCode,
          colorDesc: s.colorDesc,
          season: s.season,
          seasonType: 'Main',
          customer: s.customer,
          customerType: s.customerType,
          unitsBooked: s.unitsBooked,
          unitsOpen: s.unitsOpen || 0,
          revenue: s.revenue,
          shipped: s.shipped || 0,
          cost: s.cost || 0,
          wholesalePrice: s.wholesalePrice || 0,
          msrp: s.msrp || 0,
          netUnitPrice: s.netUnitPrice || (s.unitsBooked > 0 ? s.revenue / s.unitsBooked : 0),
          divisionDesc: s.divisionDesc,
          categoryDesc: normalizeCategory(s.categoryDesc),
          gender: s.gender || '',
          salesRep: s.salesRep || '',
          orderType: s.orderType || '',
          invoiceDate: s.invoiceDate || null,
          accountingPeriod: s.accountingPeriod || null,
          invoiceNumber: s.invoiceNumber || null,
          shipToState: s.shipToState || null,
          returnedAtNet: s.returnedAtNet || 0,
          shippedAtNet: s.shippedAtNet || 0,
          totalPrice: s.totalPrice || 0,
          commissionRate: s.commissionRate || 0,
          ytdNetInvoicing: s.ytdNetInvoicing || 0,
          ytdCreditMemos: s.ytdCreditMemos || 0,
          ytdSales: s.ytdSales || 0,
          warehouse: s.warehouse || null,
          warehouseDesc: s.warehouseDesc || null,
          openAtNet: s.openAtNet || 0,
          openOrder: s.openOrder || 0,
          returned: s.returned || 0,
          shippedAtMsrp: s.shippedAtMsrp || 0,
          totalAtNet: s.totalAtNet || 0,
          totalAtWholesale: s.totalAtWholesale || 0,
          returnedAtWholesale: s.returnedAtWholesale || 0,
          shipToCity: s.shipToCity || null,
          shipToZip: s.shipToZip || null,
          billToState: s.billToState || null,
          billToCity: s.billToCity || null,
          billToZip: s.billToZip || null,
          unitsShipped: s.unitsShipped || 0,
          unitsReturned: s.unitsReturned || 0,
        }));

        data = {
          success: true,
          fileType: 'sales',
          summary: `${salesAppData.length.toLocaleString()} sales records across ${seasons.length} seasons (${seasonSummary})`,
          seasonBreakdown: seasonCounts,
          sales: salesAppData,
        };
      } else if (selectedType === 'costs') {
        const landedData = parseLandedSheetXLSX(buffer);
        const costsAppData = landedData.map((c, index) => ({
          id: `cost-${index}`,
          styleNumber: c.styleNumber,
          styleName: c.styleName,
          season: c.season,
          seasonType: 'Main',
          factory: c.factory,
          countryOfOrigin: c.countryOfOrigin,
          fob: c.fob,
          landed: c.landed,
          dutyCost: c.dutyCost,
          tariffCost: c.tariffCost,
          freightCost: c.freightCost,
          overheadCost: c.overheadCost,
          suggestedMsrp: c.suggestedMsrp,
          suggestedWholesale: c.suggestedWholesale,
          margin: c.margin,
          designTeam: c.designTeam,
          developer: c.developer,
          costSource: c.costSource,
        }));
        data = { success: true, fileType: 'landed', costs: costsAppData, summary: `${costsAppData.length} cost records` };
      } else if (selectedType === 'pricing') {
        const pricingData = parsePricingXLSX(buffer);
        const pricingAppData = pricingData.map((p, index) => ({
          id: `price-${index}`,
          styleNumber: p.styleNumber,
          styleDesc: p.styleDesc,
          colorCode: p.colorCode,
          colorDesc: p.colorDesc,
          season: p.season,
          seasonType: 'Main',
          seasonDesc: p.seasonDesc || '',
          price: p.price,
          msrp: p.msrp,
          cost: p.cost,
        }));
        data = { success: true, fileType: 'pricing', pricing: pricingAppData, summary: `${pricingAppData.length} pricing records` };
      } else if (selectedType === 'lineList') {
        const lineListData = parseLineListXLSX(buffer);
        const mergedResult = mergeSeasonData(lineListData, [], '');
        const appData = convertToAppFormats(mergedResult);
        data = { success: true, fileType: 'lineList', products: appData.products, costs: appData.costs, summary: `${appData.products.length} products` };
      } else if (selectedType === 'inventory') {
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        // Some KUHL inventory exports have a 2-row header: row 0 = column
        // names, row 1 = size-scale sub-headers (S/M/L/XL...). The default
        // sheet_to_json treats row 0 as the header and produces __EMPTY_N
        // keys for the unmatched cells in row 1, which then carry through
        // every data row and inflate the JSON payload past Vercel's 4.5MB
        // serverless body limit. We detect that pattern and skip row 1.
        const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
        const headerRow = (aoa[0] || []) as string[];
        const secondRow = (aoa[1] || []) as unknown[];
        const sizeTokens = new Set(['S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XS', 'XXS', '2XL', '3XL']);
        const looksLikeSizeRow =
          secondRow.length > 0 &&
          secondRow.filter((v) => typeof v === 'string' && sizeTokens.has(v.toUpperCase())).length >= 3;
        const dataStartRow = looksLikeSizeRow ? 2 : 1;
        const cleanRows = (aoa.slice(dataStartRow) as unknown[][])
          .filter((row) => row.some((cell) => cell !== '' && cell !== null && cell !== undefined))
          .map((row) => {
            const obj: Record<string, unknown> = {};
            headerRow.forEach((key, idx) => {
              if (key) obj[String(key)] = row[idx] ?? '';
            });
            return obj;
          });
        if (looksLikeSizeRow) {
          console.log(`Inventory parser: detected size-scale sub-header, skipped row 1. ${cleanRows.length} data rows.`);
        }
        data = { success: true, fileType: 'inventory', inventory: cleanRows, summary: `${cleanRows.length} inventory records` };
      } else {
        throw new Error(`Unknown file type: ${selectedType}`);
      }

      setImportProgress(70);

      // Route to appropriate handler based on type
      if (selectedType === 'invoice') {
        const allSeasonValues = ((data.sales || []) as Record<string, unknown>[])
          .map((s) => s.season as string)
          .filter((s: string) => s && s.length > 0);
        const invoiceSeasons: string[] = Array.from(new Set(allSeasonValues));
        console.log('Invoice import - detected seasons:', invoiceSeasons);

        onImportInvoice({
          invoices: data.sales as Record<string, unknown>[],
          seasons: invoiceSeasons,
        });
      } else if (selectedType === 'sales') {
        const allSeasonValues = ((data.sales || []) as Record<string, unknown>[])
          .map((s) => s.season as string)
          .filter((s: string) => s && s.length > 0);
        const salesSeasons: string[] = Array.from(new Set(allSeasonValues));
        console.log('Sales import - detected seasons:', salesSeasons);

        onImportSalesReplace({
          sales: data.sales as Record<string, unknown>[],
          seasons: salesSeasons,
        });
      } else if (selectedType === 'lineList') {
        onImportMultiSeason({
          products: (data.products || []) as Record<string, unknown>[],
          costs: (data.costs || []) as Record<string, unknown>[],
        });
      } else if (selectedType === 'costs') {
        onImportMultiSeason({ costs: data.costs as Record<string, unknown>[] });
      } else if (selectedType === 'pricing') {
        onImportMultiSeason({ pricing: data.pricing as Record<string, unknown>[] });
      } else if (selectedType === 'inventory') {
        onImportMultiSeason({ inventory: data.inventory as Record<string, unknown>[] });
      }

      setImportProgress(100);
      const addedCount = ((data.products || data.sales || data.costs || data.pricing || data.inventory || []) as unknown[]).length;
      setImportResult({
        added: addedCount,
        updated: 0,
        summary: (data.summary as string) || 'Import complete',
      });
      setState('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setState('confirm');
    }
  };

  const handleReset = () => {
    setState('drop');
    setSelectedFile(null);
    setDetection(null);
    setSelectedType('unknown');
    setError(null);
    setImportResult(null);
    setImportProgress(0);
    setMultiFileMode(false);
    setMultiFileState('queue');
    setMultiFiles([]);
    setMultiFileTotalRecords(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Line List no longer needs season selection - it's read from the file
  const needsSeason = false;

  // Get unique seasons from multi-file queue
  const multiFileSeasons = Array.from(new Set(multiFiles.filter(f => f.season).map(f => f.season)));
  const multiFileTotalCount = multiFiles.reduce((sum, f) => sum + f.recordCount, 0);
  const multiFileReadyCount = multiFiles.filter(f => f.status === 'ready').length;
  const multiFileCompleteCount = multiFiles.filter(f => f.status === 'complete').length;

  // Multi-file mode UI
  if (multiFileMode) {
    return (
      <div
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1100] p-4"
        onClick={onClose}
      >
        <div
          className="bg-surface rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b flex items-center justify-between bg-surface-secondary">
            <h2 className="text-xl font-bold">
              {multiFileState === 'complete' ? 'Import Complete' : 'Import Sales Data'}
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-surface-tertiary rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Queue State */}
            {multiFileState === 'queue' && (
              <div className="space-y-4">
                <p className="text-sm text-text-secondary">
                  <span className="font-semibold">{multiFiles.length} files</span> detected as Sales Data
                </p>

                {/* File List */}
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-tertiary">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold text-text-secondary">File</th>
                        <th className="px-4 py-2 text-left font-semibold text-text-secondary w-24">Season</th>
                        <th className="px-4 py-2 text-right font-semibold text-text-secondary w-28">Records</th>
                        <th className="px-4 py-2 text-center font-semibold text-text-secondary w-24">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {multiFiles.map((item, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <FileSpreadsheet className="w-4 h-4 text-cyan-600 flex-shrink-0" />
                              <span className="font-medium truncate">{item.filename}</span>
                              <span className="text-xs text-text-faint">{item.fileSize}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {item.season ? (
                              <span className="px-2 py-1 bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-200 text-xs font-semibold rounded">
                                {item.season}
                              </span>
                            ) : (
                              <span className="text-text-faint">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono">
                            {item.recordCount > 0 ? item.recordCount.toLocaleString() : '—'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {item.status === 'pending' && (
                              <span className="text-text-faint">Pending</span>
                            )}
                            {item.status === 'detecting' && (
                              <Loader2 className="w-4 h-4 mx-auto text-cyan-500 animate-spin" />
                            )}
                            {item.status === 'ready' && (
                              <CheckCircle className="w-4 h-4 mx-auto text-green-500" />
                            )}
                            {item.status === 'error' && (
                              <div className="flex items-center justify-center gap-1">
                                <AlertCircle className="w-4 h-4 text-red-500" />
                                <span className="text-xs text-red-600">{item.error}</span>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-surface-secondary font-semibold">
                      <tr className="border-t-2">
                        <td className="px-4 py-3">TOTAL</td>
                        <td className="px-4 py-3"></td>
                        <td className="px-4 py-3 text-right font-mono">
                          {multiFileTotalCount.toLocaleString()} records
                        </td>
                        <td className="px-4 py-3"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Replace Mode Warning */}
                {multiFileReadyCount > 0 && (
                  <div className="p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-amber-800 dark:text-amber-200">REPLACE MODE</p>
                        <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                          This will delete all existing sales data for these seasons ({multiFileSeasons.join(', ')}) and import fresh.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Error Display */}
                {error && (
                  <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                    <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                  </div>
                )}
              </div>
            )}

            {/* Importing State */}
            {multiFileState === 'importing' && (
              <div className="space-y-4">
                <p className="text-sm text-text-secondary mb-4">Importing...</p>

                {/* Progress List */}
                <div className="space-y-2">
                  {multiFiles.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-surface-secondary rounded-lg">
                      <div className="w-6 flex-shrink-0">
                        {item.status === 'complete' && (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        )}
                        {item.status === 'importing' && (
                          <Loader2 className="w-5 h-5 text-cyan-500 animate-spin" />
                        )}
                        {item.status === 'ready' && (
                          <Clock className="w-5 h-5 text-text-faint" />
                        )}
                        {item.status === 'error' && (
                          <AlertCircle className="w-5 h-5 text-red-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{item.season}</span>
                          <span className="text-xs text-text-muted">
                            {item.status === 'complete'
                              ? `${item.importedCount?.toLocaleString()} records`
                              : item.status === 'importing'
                              ? `${Math.round(item.progress)}%`
                              : item.status === 'error'
                              ? item.error
                              : 'pending'}
                          </span>
                        </div>
                        {item.status === 'importing' && (
                          <div className="w-full bg-surface-tertiary rounded-full h-1.5 mt-1">
                            <div
                              className="bg-cyan-500 h-1.5 rounded-full transition-all duration-300"
                              style={{ width: `${item.progress}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Complete State */}
            {multiFileState === 'complete' && (
              <div className="text-center py-6">
                <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
                <p className="text-lg font-medium text-text-primary mb-2">
                  Import Successful
                </p>
                <p className="text-sm text-text-secondary">
                  Successfully imported {multiFileTotalRecords.toLocaleString()} sales records across {multiFileCompleteCount} seasons
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t flex justify-end gap-3 bg-surface-secondary">
            {multiFileState === 'queue' && (
              <>
                <button
                  onClick={handleReset}
                  className="px-4 py-2 text-text-secondary hover:bg-surface-tertiary rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleMultiFileImport}
                  disabled={multiFileReadyCount === 0}
                  className="px-6 py-2 bg-cyan-600 text-white font-bold rounded-lg hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Import All ({multiFileReadyCount} files)
                </button>
              </>
            )}

            {multiFileState === 'complete' && (
              <button
                onClick={onClose}
                className="px-6 py-2 bg-cyan-600 text-white font-bold rounded-lg hover:bg-cyan-700 transition-colors"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Single file mode UI (existing)
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1100] p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between bg-surface-secondary">
          <h2 className="text-xl font-bold">
            {state === 'complete' ? 'Import Complete' : 'Import Data'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-surface-tertiary rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Drop Zone State */}
          {state === 'drop' && (
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                isDragging
                  ? 'border-cyan-500 bg-cyan-50'
                  : 'border-border-strong hover:border-border-strong'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                multiple
                className="hidden"
                onChange={handleFileInputChange}
              />
              <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragging ? 'text-cyan-500' : 'text-text-faint'}`} />
              <p className="text-lg font-medium text-text-secondary mb-2">
                Drop your Excel file(s) here
              </p>
              <p className="text-sm text-text-muted mb-4">
                or click to browse
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-cyan-600 text-white font-medium rounded-lg hover:bg-cyan-700 transition-colors"
              >
                Select File(s)
              </button>
              <p className="text-xs text-text-faint mt-4">
                Supports Line List, Sales, Invoice, Costs, and Pricing files
              </p>
              <p className="text-xs text-cyan-600 mt-1">
                Drop multiple Sales files for batch import with REPLACE mode
              </p>
            </div>
          )}

          {/* Detecting State */}
          {state === 'detecting' && (
            <div className="text-center py-8">
              <Loader2 className="w-12 h-12 mx-auto mb-4 text-cyan-500 animate-spin" />
              <p className="text-lg font-medium text-text-secondary">
                Analyzing file...
              </p>
              <p className="text-sm text-text-muted mt-2">
                {selectedFile?.name}
              </p>
            </div>
          )}

          {/* Confirm State */}
          {state === 'confirm' && detection && (
            <div className="space-y-4">
              {/* File Info */}
              <div className="flex items-start gap-3 p-3 bg-surface-secondary rounded-lg">
                <FileSpreadsheet className="w-8 h-8 text-cyan-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-text-primary truncate">
                    {detection.filename}
                  </p>
                  <p className="text-sm text-text-muted">
                    {detection.fileSize} &middot; {detection.recordCount.toLocaleString()} records
                  </p>
                </div>
              </div>

              {/* Detected Type */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  File Type
                  {detection.confidence === 'high' && (
                    <span className="ml-2 text-xs text-green-600 font-normal">
                      (auto-detected)
                    </span>
                  )}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['lineList', 'sales', 'invoice', 'costs', 'pricing', 'inventory'] as FileType[]).map(type => (
                    <label
                      key={type}
                      className={`flex items-center gap-2 p-3 border-2 rounded-lg cursor-pointer transition-colors ${
                        selectedType === type
                          ? 'border-cyan-500 bg-cyan-50'
                          : 'border-border-primary hover:border-border-strong'
                      }`}
                    >
                      <input
                        type="radio"
                        name="fileType"
                        value={type}
                        checked={selectedType === type}
                        onChange={() => setSelectedType(type)}
                        className="sr-only"
                      />
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          selectedType === type
                            ? 'border-cyan-500'
                            : 'border-border-strong'
                        }`}
                      >
                        {selectedType === type && (
                          <div className="w-2 h-2 rounded-full bg-cyan-500" />
                        )}
                      </div>
                      <span className={selectedType === type ? 'font-medium' : ''}>
                        {FILE_TYPE_LABELS[type]}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Season Selector (for Line List) */}
              {needsSeason && (
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Season
                    {detection.detectedSeason && detection.detectedSeason === selectedSeason && (
                      <span className="ml-2 text-xs text-green-600 font-normal">
                        (auto-detected from filename)
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <select
                      value={selectedSeason}
                      onChange={e => setSelectedSeason(e.target.value)}
                      className="w-full px-3 py-2 border-2 border-border-strong rounded-lg appearance-none focus:border-cyan-500 focus:outline-none"
                    >
                      {AVAILABLE_SEASONS.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                          {existingSeasons.includes(opt.value) ? ' (has data)' : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint pointer-events-none" />
                  </div>
                </div>
              )}

              {/* Matched Columns */}
              {detection.matchedColumns.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-text-secondary mb-2">
                    Matched Columns ({detection.matchedColumns.length})
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {detection.matchedColumns.map((col, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-200 text-xs rounded"
                      >
                        <CheckCircle className="w-3 h-3" />
                        {col}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview Toggle */}
              <div>
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary"
                >
                  {showPreview ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                  {showPreview ? 'Hide Preview' : 'Show Preview'}
                </button>
                {showPreview && detection.previewRows.length > 0 && (
                  <div className="mt-2 overflow-x-auto">
                    <table className="min-w-full text-xs border rounded">
                      <thead className="bg-surface-tertiary">
                        <tr>
                          {Object.keys(detection.previewRows[0]).slice(0, 6).map((key, i) => (
                            <th key={i} className="px-2 py-1 text-left font-medium truncate max-w-[100px]">
                              {key}
                            </th>
                          ))}
                          {Object.keys(detection.previewRows[0]).length > 6 && (
                            <th className="px-2 py-1 text-left font-medium text-text-faint">
                              +{Object.keys(detection.previewRows[0]).length - 6} more
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {detection.previewRows.slice(0, 3).map((row, i) => (
                          <tr key={i} className="border-t">
                            {Object.values(row).slice(0, 6).map((val, j) => (
                              <td key={j} className="px-2 py-1 truncate max-w-[100px]">
                                {String(val || '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Error Display */}
              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                  <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                </div>
              )}

              {/* Overwrite Warning */}
              {overwriteCheck && overwriteCheck.warning && (
                <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 rounded-lg space-y-3">
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                        Existing Data Will Be Replaced
                      </p>
                      <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                        {overwriteCheck.warning}
                      </p>
                      {overwriteCheck.lastImport && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                          Last import: {overwriteCheck.lastImport.fileName} ({overwriteCheck.lastImport.recordCount.toLocaleString()} records, {new Date(overwriteCheck.lastImport.importedAt).toLocaleDateString()})
                        </p>
                      )}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={overwriteConfirmed}
                      onChange={e => setOverwriteConfirmed(e.target.checked)}
                      className="w-4 h-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                    />
                    <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      I understand — replace existing data
                    </span>
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Importing State */}
          {state === 'importing' && (
            <div className="text-center py-8">
              <div className="w-full bg-surface-tertiary rounded-full h-3 mb-4 overflow-hidden">
                <div
                  className="bg-cyan-500 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${importProgress}%` }}
                />
              </div>
              <p className="text-lg font-medium text-text-secondary">
                Importing...
              </p>
              <p className="text-sm text-text-muted mt-2">
                {importProgress < 50 ? 'Parsing file...' : importProgress < 80 ? 'Processing records...' : 'Saving data...'}
              </p>
            </div>
          )}

          {/* Complete State */}
          {state === 'complete' && importResult && (
            <div className="text-center py-6">
              <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
              <p className="text-lg font-medium text-text-primary mb-2">
                Import Successful
              </p>
              <p className="text-sm text-text-secondary">
                {importResult.summary}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-end gap-3 bg-surface-secondary">
          {state === 'drop' && (
            <button
              onClick={onClose}
              className="px-4 py-2 text-text-secondary hover:bg-surface-tertiary rounded-lg transition-colors"
            >
              Cancel
            </button>
          )}

          {state === 'confirm' && (
            <>
              <button
                onClick={handleReset}
                className="px-4 py-2 text-text-secondary hover:bg-surface-tertiary rounded-lg transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={selectedType === 'unknown' || (overwriteCheck !== null && !overwriteConfirmed)}
                className="px-6 py-2 bg-cyan-600 text-white font-bold rounded-lg hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {overwriteCheck && overwriteConfirmed ? 'Replace & Import' : 'Import'}
              </button>
            </>
          )}

          {state === 'complete' && (
            <button
              onClick={onClose}
              className="px-6 py-2 bg-cyan-600 text-white font-bold rounded-lg hover:bg-cyan-700 transition-colors"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
