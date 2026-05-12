import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** One-off diagnostic: are Sale.gender and Sale.divisionDesc actually
 *  distinct columns in your data, or do they always match? Helps decide
 *  whether the page needs separate Gender and Division filters. */
export async function GET() {
  try {
    const matrix = await prisma.$queryRawUnsafe<Array<{
      gender: string | null; division: string | null; cnt: bigint;
    }>>(`
      SELECT
        "gender",
        "divisionDesc" AS division,
        COUNT(*)::bigint AS cnt
      FROM "Sale"
      GROUP BY "gender", "divisionDesc"
      ORDER BY cnt DESC
    `);
    const distinctGenders = await prisma.$queryRawUnsafe<Array<{ g: string | null }>>(
      `SELECT DISTINCT "gender" AS g FROM "Sale" ORDER BY g NULLS LAST`,
    );
    const distinctDivisions = await prisma.$queryRawUnsafe<Array<{ d: string | null }>>(
      `SELECT DISTINCT "divisionDesc" AS d FROM "Sale" ORDER BY d NULLS LAST`,
    );
    return NextResponse.json({
      distinctGenders: distinctGenders.map(r => r.g),
      distinctDivisions: distinctDivisions.map(r => r.d),
      genderXdivision: matrix.map(r => ({
        gender: r.gender,
        division: r.division,
        count: Number(r.cnt),
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
