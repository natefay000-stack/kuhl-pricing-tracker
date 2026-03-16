import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const { id, styleNumber, season, landed, margin } = await request.json();

    if (id) {
      // Update by ID
      const result = await prisma.cost.update({
        where: { id },
        data: { landed, margin },
      });
      return NextResponse.json({ success: true, updated: result });
    } else if (styleNumber && season) {
      // Update by styleNumber + season
      const result = await prisma.cost.updateMany({
        where: { styleNumber, season },
        data: { landed, margin },
      });
      return NextResponse.json({ success: true, count: result.count });
    }

    return NextResponse.json({ error: 'Provide id or styleNumber+season' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
