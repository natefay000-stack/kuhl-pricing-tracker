import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Lists InvoiceSnapshot rows (metadata only — without the heavy yearMonth /
 * topStyles / topCustomers JSONB blobs). Read-only, no auth required.
 *
 *   GET /api/admin/list-snapshots          → 90 most-recent snapshots
 *   GET /api/admin/list-snapshots?id=...   → full snapshot detail (incl. JSONB)
 */
interface SnapshotMetaRow {
  id: string;
  takenAt: Date;
  trigger: string;
  totalRows: number;
  totalNetInvoiced: number;
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id');

  try {
    if (id) {
      // Detail mode: include the JSONB columns
      const rows = await prisma.$queryRawUnsafe<Array<SnapshotMetaRow & {
        yearMonth: unknown; topStyles: unknown; topCustomers: unknown;
      }>>(
        `SELECT "id", "takenAt", "trigger", "totalRows", "totalNetInvoiced",
                "yearMonth", "topStyles", "topCustomers"
         FROM "InvoiceSnapshot" WHERE "id" = $1`,
        id,
      );
      if (rows.length === 0) {
        return NextResponse.json({ error: 'snapshot not found' }, { status: 404 });
      }
      const r = rows[0];
      return NextResponse.json({
        ...r,
        takenAt: r.takenAt.toISOString(),
      });
    }

    // List mode: metadata only
    const rows = await prisma.$queryRawUnsafe<SnapshotMetaRow[]>(`
      SELECT "id", "takenAt", "trigger", "totalRows", "totalNetInvoiced"
      FROM "InvoiceSnapshot"
      ORDER BY "takenAt" DESC
      LIMIT 100
    `);
    return NextResponse.json({
      count: rows.length,
      snapshots: rows.map(r => ({ ...r, takenAt: r.takenAt.toISOString() })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Friendly response if the table hasn't been created yet (no snapshots have run)
    if (msg.includes('relation "InvoiceSnapshot" does not exist')) {
      return NextResponse.json({
        count: 0,
        snapshots: [],
        hint: 'No snapshots taken yet. POST /api/admin/snapshot-invoices?token=... to create the first one.',
      });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
