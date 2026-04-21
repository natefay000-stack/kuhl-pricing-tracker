import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * POST /api/data/import-ats
 *
 * Multipart form upload: `file` = .xlsx with the ATS export columns
 * (Style, Color, Units ATS, Units On Hand, Units At-Once, Inventory
 * Classification, etc.). Aggregates from size-level to style × color,
 * then replaces the entire AtsInventory table in one transaction.
 */
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return NextResponse.json({ error: 'No sheet found' }, { status: 400 });

    type Row = Record<string, unknown>;
    const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: null });

    // Quick column presence check
    const first = rows[0] ?? {};
    const required = ['Style', 'Color', 'Units ATS', 'Units On Hand'];
    for (const col of required) {
      if (!(col in first)) {
        return NextResponse.json(
          { error: `Missing required column "${col}". Is this the ATS export?` },
          { status: 400 }
        );
      }
    }

    // Aggregate to style × color (sum units across sizes; take first of metadata)
    const agg = new Map<string, {
      styleNumber: string;
      color: string;
      styleDesc: string;
      colorDesc: string;
      gender: string;
      category: string;
      styleSegment: string;
      blockCode: string;
      classification: string;
      wholesale: number;
      msrp: number;
      styleVendor: string;
      warehouse: string;
      unitsATS: number;
      unitsOnHand: number;
      unitsAtOnce: number;
    }>();

    const num = (v: unknown): number => {
      if (v == null || v === '') return 0;
      const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
      return Number.isFinite(n) ? n : 0;
    };
    const str = (v: unknown): string => {
      if (v == null) return '';
      return String(v).trim();
    };

    for (const r of rows) {
      const styleNumber = str(r['Style']);
      const color = str(r['Color']);
      if (!styleNumber || !color) continue;
      const key = `${styleNumber}|${color}`;
      const cur = agg.get(key);
      if (cur) {
        cur.unitsATS += num(r['Units ATS']);
        cur.unitsOnHand += num(r['Units On Hand']);
        cur.unitsAtOnce += num(r['Units At-Once']);
      } else {
        agg.set(key, {
          styleNumber,
          color,
          styleDesc: str(r['Style Description']),
          colorDesc: str(r['Color Description']),
          gender: str(r['Gender Description']),
          category: str(r['Category Description']),
          styleSegment: str(r['Style Segment Description']),
          blockCode: str(r['Block Code Description']),
          classification: str(r['Inventory Classification']),
          wholesale: num(r['$ Unit Price - Wholesale']),
          msrp: num(r['$ Unit Price - Retail (MSRP)']),
          styleVendor: str(r['Style Vendor']),
          warehouse: str(r['Warehouse']),
          unitsATS: num(r['Units ATS']),
          unitsOnHand: num(r['Units On Hand']),
          unitsAtOnce: num(r['Units At-Once']),
        });
      }
    }

    const list = Array.from(agg.values());
    const snapshotDate = new Date();

    // Replace-all in one transaction. ~3,500 rows → fast.
    await prisma.$transaction(async (tx) => {
      await tx.atsInventory.deleteMany({});
      if (list.length > 0) {
        // createMany doesn't support skipDuplicates on all DBs — our unique
        // constraint (styleNumber, color) is already deduped in memory.
        await tx.atsInventory.createMany({
          data: list.map((r) => ({ ...r, snapshotDate })),
        });
      }
    });

    return NextResponse.json({
      success: true,
      imported: list.length,
      rawRows: rows.length,
      snapshotDate: snapshotDate.toISOString(),
    });
  } catch (error) {
    console.error('import-ats error:', error);
    return NextResponse.json(
      {
        error: 'Failed to import ATS',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
