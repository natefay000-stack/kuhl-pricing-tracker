import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { detectFileType, extractSeasonFromFilename, formatFileSize, FileType } from '@/lib/file-detection';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export interface DetectFileResponse {
  success: boolean;
  filename: string;
  fileSize: string;
  detectedType: FileType;
  confidence: 'high' | 'medium' | 'low';
  matchedColumns: string[];
  allColumns: string[];
  recordCount: number;
  detectedSeason: string | null;
  previewRows: Record<string, unknown>[];
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<DetectFileResponse>> {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({
        success: false,
        filename: '',
        fileSize: '0',
        detectedType: 'unknown',
        confidence: 'low',
        matchedColumns: [],
        allColumns: [],
        recordCount: 0,
        detectedSeason: null,
        previewRows: [],
        error: 'No file provided',
      }, { status: 400 });
    }

    console.log(`Detecting file type for: ${file.name} (${file.size} bytes)`);

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });

    // Get the first sheet (or specific sheet for known formats)
    let sheetName = workbook.SheetNames[0];

    // Check for known sheet names
    if (workbook.SheetNames.includes('Line List')) {
      sheetName = 'Line List';
    } else if (workbook.SheetNames.includes('Sheet1')) {
      sheetName = 'Sheet1';
    } else if (workbook.SheetNames.includes('LDP Requests')) {
      sheetName = 'LDP Requests';
    }

    const sheet = workbook.Sheets[sheetName];

    // For LDP Requests sheet, data starts at row 11
    const isLDPSheet = sheetName === 'LDP Requests';
    const rows = XLSX.utils.sheet_to_json(sheet, {
      defval: '',
      range: isLDPSheet ? 10 : undefined,
    }) as Record<string, unknown>[];

    if (rows.length === 0) {
      return NextResponse.json({
        success: false,
        filename: file.name,
        fileSize: formatFileSize(file.size),
        detectedType: 'unknown',
        confidence: 'low',
        matchedColumns: [],
        allColumns: [],
        recordCount: 0,
        detectedSeason: null,
        previewRows: [],
        error: 'File appears to be empty or has no data rows',
      }, { status: 400 });
    }

    // Get headers from first row
    const headers = Object.keys(rows[0]);

    // Detect file type from headers
    const detection = detectFileType(headers);

    // Extract season from filename
    const detectedSeason = extractSeasonFromFilename(file.name);

    // Get preview rows (first 5)
    const previewRows = rows.slice(0, 5);

    console.log(`Detected: ${detection.type} (${detection.confidence}), Season: ${detectedSeason}, Records: ${rows.length}`);

    return NextResponse.json({
      success: true,
      filename: file.name,
      fileSize: formatFileSize(file.size),
      detectedType: detection.type,
      confidence: detection.confidence,
      matchedColumns: detection.matchedColumns,
      allColumns: detection.allColumns,
      recordCount: rows.length,
      detectedSeason,
      previewRows,
    });
  } catch (error) {
    console.error('File detection error:', error);
    return NextResponse.json({
      success: false,
      filename: '',
      fileSize: '0',
      detectedType: 'unknown',
      confidence: 'low',
      matchedColumns: [],
      allColumns: [],
      recordCount: 0,
      detectedSeason: null,
      previewRows: [],
      error: error instanceof Error ? error.message : 'Failed to analyze file',
    }, { status: 500 });
  }
}
