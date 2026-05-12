import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdminToken } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Delete Sale rows for a given season. Used to clear stale data
 * before re-importing a fresh snapshot of that season's sales —
 * since Sale imports use skipDuplicates against the narrow natural
 * key, an in-place re-import would not refresh dollar values on
 * existing rows. Wipe-then-import is the correct flow.
 *
 *   GET  ?season=26SP                    → dry-run row count
 *   POST ?season=26SP&force=1&token=...  → execute the delete
 */
function parseSeason(req: Request): string | null {
  const s = new URL(req.url).searchParams.get('season') ?? '';
  return /^\d{2}(SP|FA)$/i.test(s) ? s.toUpperCase() : null;
}

export async function GET(request: Request) {
  const season = parseSeason(request);
  if (!season) {
    return NextResponse.json({ error: 'season parameter required (e.g. 26SP)' }, { status: 400 });
  }
  try {
    const count = await prisma.sale.count({ where: { season } });
    return NextResponse.json({
      mode: 'dry-run',
      season,
      wouldDelete: count,
      hint: `POST ?season=${season}&force=1&token=$ADMIN_TOKEN to actually delete.`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const denied = requireAdminToken(request);
  if (denied) return denied;

  const season = parseSeason(request);
  const force = new URL(request.url).searchParams.get('force') === '1' || new URL(request.url).searchParams.get('force') === 'true';
  if (!season) {
    return NextResponse.json({ error: 'season parameter required (e.g. 26SP)' }, { status: 400 });
  }
  if (!force) {
    return NextResponse.json(
      { error: 'force=1 required on POST. Use GET for a dry-run.' },
      { status: 400 },
    );
  }
  try {
    const before = await prisma.sale.count();
    const result = await prisma.sale.deleteMany({ where: { season } });
    const after = await prisma.sale.count();
    return NextResponse.json({
      success: true,
      season,
      deleted: result.count,
      tableBefore: before,
      tableAfter: after,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
