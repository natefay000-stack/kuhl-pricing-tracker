import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Serve pre-built data snapshots from disk
// ?file=core → data-core.json (small: products, pricing, costs, inventory, aggregations)
// ?file=sales → data-sales.json (large: 380K sales records)
export async function GET(request: NextRequest) {
  const file = request.nextUrl.searchParams.get('file') || 'core';
  const fileName = file === 'sales' ? 'data-sales.json' : 'data-core.json';
  const filePath = join(process.cwd(), 'public', fileName);

  if (!existsSync(filePath)) {
    return NextResponse.json({ error: `Snapshot not found: ${fileName}` }, { status: 404 });
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
