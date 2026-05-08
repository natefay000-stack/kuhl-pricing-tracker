import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** Lightweight cache-busting probe.
 *
 *  Returns a string `version` that the client compares against the version
 *  it stored alongside its IndexedDB cache. If they match, the client can
 *  skip the heavy paginated fetch entirely — the data hasn't changed.
 *  If they differ (after an import, delete, etc.), the client re-fetches.
 *
 *  Version = total invoice row count. Bumps on every insert and delete,
 *  which is sufficient: invoice rows aren't updated in place, only
 *  inserted (via skipDuplicates) or deleted (via wipe-all / delete-by-year).
 *  An identical-count delete-then-reimport could theoretically miss the
 *  bust, but that's vanishingly rare in practice — a manual "Refresh from
 *  DB" still recovers from it.
 */
export async function GET() {
  try {
    const count = await prisma.invoice.count();
    return NextResponse.json({ version: String(count), count });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
