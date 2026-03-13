import { NextRequest, NextResponse } from 'next/server';
import { readdirSync, statSync, existsSync, createReadStream } from 'fs';
import { join, extname } from 'path';

export const dynamic = 'force-dynamic';

interface FileInfo {
  name: string;
  size: number;
  modified: string;
  category: string;
  ext: string;
}

// Categorize files by their name pattern
function categorize(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('sales')) return 'Sales';
  if (lower.includes('invoice')) return 'Invoices';
  if (lower.includes('inventory') || lower.includes(' oh ')) return 'Inventory';
  if (lower.includes('line list') || lower.includes('ll ')) return 'Line List';
  if (lower.includes('landed') || lower.includes('cost')) return 'Costs';
  if (lower.includes('price')) return 'Pricing';
  if (lower.includes('color')) return 'Colors';
  if (lower.includes('lineup') || lower.includes('model')) return 'Product';
  if (lower.includes('tariff')) return 'Tariffs';
  return 'Other';
}

// GET /api/files — list all data files
// GET /api/files?download=filename.xlsx — download a specific file
export async function GET(request: NextRequest) {
  const dataDir = join(process.cwd(), 'data');

  if (!existsSync(dataDir)) {
    return NextResponse.json({
      success: true,
      files: [],
      message: 'No data directory found. Source files are only available on the local development server.',
    });
  }

  const downloadFile = request.nextUrl.searchParams.get('download');

  // Download mode: serve a specific file
  if (downloadFile) {
    // Sanitize filename to prevent directory traversal
    const safeName = downloadFile.replace(/[/\\]/g, '');
    const filePath = join(dataDir, safeName);

    if (!existsSync(filePath) || !filePath.startsWith(dataDir)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const stat = statSync(filePath);
    const ext = extname(safeName).toLowerCase();
    const contentType = ext === '.xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : ext === '.xls'
        ? 'application/vnd.ms-excel'
        : ext === '.csv'
          ? 'text/csv'
          : 'application/octet-stream';

    // Read file as stream
    const stream = createReadStream(filePath);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${safeName}"`,
        'Content-Length': String(stat.size),
      },
    });
  }

  // List mode: return all data files
  try {
    const entries = readdirSync(dataDir);
    const files: FileInfo[] = entries
      .filter(name => {
        const ext = extname(name).toLowerCase();
        return ['.xlsx', '.xls', '.csv'].includes(ext);
      })
      .map(name => {
        const stat = statSync(join(dataDir, name));
        return {
          name,
          size: stat.size,
          modified: stat.mtime.toISOString(),
          category: categorize(name),
          ext: extname(name).toLowerCase().replace('.', ''),
        };
      })
      .sort((a, b) => b.modified.localeCompare(a.modified)); // newest first

    return NextResponse.json({
      success: true,
      files,
      totalSize: files.reduce((sum, f) => sum + f.size, 0),
      count: files.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to list files', details: String(err) },
      { status: 500 }
    );
  }
}
