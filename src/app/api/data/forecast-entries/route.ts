import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Forecast entries — what each rep wants to forecast for an upcoming season.
 *
 *   GET ?targetSeason=27SP&rep=JSHA[&customer=...]
 *     Returns all entries this rep has created for the target season,
 *     scoped to customer if provided. Used by the Forecast Planner UI to
 *     hydrate the input cells.
 *
 *   PUT
 *     Upsert one entry. Body:
 *       { targetSeason, rep, customer?, category?, styleNumber?,
 *         colorCode?, unitsForecast, dollarsForecast, notes? }
 *     If both unitsForecast and dollarsForecast are 0/null/undefined,
 *     the row is DELETED (clearing both inputs removes the forecast).
 *
 *   DELETE ?targetSeason=...&rep=... + the same scope keys
 *     Explicit delete (rarely used; PUT-with-zeros covers the common case).
 *
 * Storage: separate ForecastEntry table created via raw SQL on first
 * invocation (Prisma client doesn't know about the model yet because we
 * can't run prisma db push from this environment). Composite unique key
 * uses NULLS NOT DISTINCT so optional scope fields collapse correctly.
 */

type EntryKey = {
  targetSeason: string;
  rep: string;
  customer: string | null;
  category: string | null;
  styleNumber: string | null;
  colorCode: string | null;
};

async function ensureTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ForecastEntry" (
      "id"               TEXT PRIMARY KEY,
      "targetSeason"     TEXT NOT NULL,
      "rep"              TEXT NOT NULL,
      "customer"         TEXT,
      "category"         TEXT,
      "styleNumber"      TEXT,
      "colorCode"        TEXT,
      "unitsForecast"    INTEGER NOT NULL DEFAULT 0,
      "dollarsForecast"  DOUBLE PRECISION NOT NULL DEFAULT 0,
      "colorRank"        INTEGER,
      "notes"            TEXT,
      "createdAt"        TIMESTAMP NOT NULL DEFAULT NOW(),
      "updatedAt"        TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  // Idempotent ALTER for existing tables created before colorRank existed.
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "ForecastEntry" ADD COLUMN IF NOT EXISTS "colorRank" INTEGER`,
  );
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "ForecastEntry_natural_key"
      ON "ForecastEntry" ("targetSeason","rep","customer","category","styleNumber","colorCode")
      NULLS NOT DISTINCT
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "ForecastEntry_targetSeason_idx" ON "ForecastEntry" ("targetSeason")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "ForecastEntry_rep_idx" ON "ForecastEntry" ("rep")`,
  );
}

function bodyToKey(body: Record<string, unknown>): EntryKey | null {
  const targetSeason = typeof body.targetSeason === 'string' ? body.targetSeason : '';
  const rep = typeof body.rep === 'string' ? body.rep : '';
  if (!targetSeason || !rep) return null;
  const norm = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : null);
  return {
    targetSeason,
    rep,
    customer: norm(body.customer),
    category: norm(body.category),
    styleNumber: norm(body.styleNumber),
    colorCode: norm(body.colorCode),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const targetSeason = url.searchParams.get('targetSeason') ?? '';
  const rep = url.searchParams.get('rep') ?? '';
  const customer = url.searchParams.get('customer'); // optional
  if (!targetSeason || !rep) {
    return NextResponse.json({ error: 'targetSeason and rep query params required' }, { status: 400 });
  }
  try {
    await ensureTable();
    const rows = customer
      ? await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT * FROM "ForecastEntry"
           WHERE "targetSeason" = $1 AND "rep" = $2 AND "customer" = $3`,
          targetSeason, rep, customer,
        )
      : await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT * FROM "ForecastEntry"
           WHERE "targetSeason" = $1 AND "rep" = $2 AND "customer" IS NULL`,
          targetSeason, rep,
        );
    return NextResponse.json({ entries: rows });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const key = bodyToKey(body);
  if (!key) {
    return NextResponse.json({ error: 'targetSeason and rep are required' }, { status: 400 });
  }
  const units = Number(body.unitsForecast ?? 0);
  const dollars = Number(body.dollarsForecast ?? 0);
  // colorRank: positive integer, or null to clear. Allow it through even
  // when units/dollars are zero (rep might rank without committing $ yet).
  const colorRank = body.colorRank === null || body.colorRank === undefined || body.colorRank === ''
    ? null
    : Math.max(1, Math.floor(Number(body.colorRank) || 0)) || null;
  const notes = typeof body.notes === 'string' && body.notes.length > 0 ? body.notes : null;
  // All inputs empty → delete (fully clears the forecast). Uses NULLS NOT
  // DISTINCT so the WHERE clause matches NULL columns correctly.
  if (units === 0 && dollars === 0 && colorRank === null && !notes) {
    try {
      await ensureTable();
      const r = await prisma.$executeRawUnsafe(
        `DELETE FROM "ForecastEntry"
         WHERE "targetSeason" = $1 AND "rep" = $2
           AND "customer" IS NOT DISTINCT FROM $3
           AND "category" IS NOT DISTINCT FROM $4
           AND "styleNumber" IS NOT DISTINCT FROM $5
           AND "colorCode" IS NOT DISTINCT FROM $6`,
        key.targetSeason, key.rep, key.customer, key.category, key.styleNumber, key.colorCode,
      );
      return NextResponse.json({ success: true, action: 'deleted', deleted: Number(r) });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      );
    }
  }
  try {
    await ensureTable();
    const id = `fc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ForecastEntry" (
        "id", "targetSeason", "rep", "customer", "category", "styleNumber", "colorCode",
        "unitsForecast", "dollarsForecast", "colorRank", "notes", "updatedAt"
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, NOW())
       ON CONFLICT ("targetSeason","rep","customer","category","styleNumber","colorCode")
       DO UPDATE SET
         "unitsForecast" = EXCLUDED."unitsForecast",
         "dollarsForecast" = EXCLUDED."dollarsForecast",
         "colorRank" = EXCLUDED."colorRank",
         "notes" = EXCLUDED."notes",
         "updatedAt" = NOW()`,
      id, key.targetSeason, key.rep, key.customer, key.category, key.styleNumber, key.colorCode,
      units, dollars, colorRank, notes,
    );
    return NextResponse.json({ success: true, action: 'upserted' });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
