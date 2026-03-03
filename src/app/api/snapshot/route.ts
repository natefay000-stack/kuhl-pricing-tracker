import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Serve pre-built data snapshots from disk
// ?file=core → data-core.json (small: products, pricing, costs, inventory, aggregations)
// ?file=sales → reassembles from per-season data-sales-{season}.json files
export async function GET(request: NextRequest) {
  const file = request.nextUrl.searchParams.get('file') || 'core';

  if (file === 'core') {
    const filePath = join(process.cwd(), 'public', 'data-core.json');
    if (!existsSync(filePath)) {
      return NextResponse.json({ error: 'Snapshot not found: data-core.json' }, { status: 404 });
    }
    try {
      const data = readFileSync(filePath, 'utf-8');
      return new NextResponse(data, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    } catch (err) {
      return NextResponse.json(
        { error: 'Failed to read snapshot', details: String(err) },
        { status: 500 }
      );
    }
  }

  // Sales: reassemble from per-season files
  try {
    const publicDir = join(process.cwd(), 'public');

    // Try manifest first (new format)
    const manifestPath = join(publicDir, 'data-sales-manifest.json');
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      const allSales: unknown[] = [];

      for (const season of manifest.seasons) {
        const seasonPath = join(publicDir, `data-sales-${season}.json`);
        if (existsSync(seasonPath)) {
          const seasonData = JSON.parse(readFileSync(seasonPath, 'utf-8'));
          allSales.push(...seasonData);
        }
      }

      const result = {
        success: true,
        buildTime: manifest.buildTime,
        totalSales: allSales.length,
        sales: allSales,
      };

      return new NextResponse(JSON.stringify(result), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    // Fallback: old single-file format
    const salesPath = join(publicDir, 'data-sales.json');
    if (existsSync(salesPath)) {
      const data = readFileSync(salesPath, 'utf-8');
      return new NextResponse(data, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    return NextResponse.json({ error: 'Sales snapshot not found' }, { status: 404 });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to read sales snapshot', details: String(err) },
      { status: 500 }
    );
  }
}
