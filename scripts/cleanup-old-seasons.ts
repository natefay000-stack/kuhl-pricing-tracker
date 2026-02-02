import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Seasons to keep: 24SP, 24FA, 25SP, 25FA, 26SP, 26FA, 27SP, 27FA (and future)
  // Delete everything from 23FA and earlier

  const seasonsToDelete = [
    '10SP', '10FA', '11SP', '11FA', '12SP', '12FA',
    '13SP', '13FA', '14SP', '14FA', '15SP', '15FA',
    '16SP', '16FA', '17SP', '17FA', '18SP', '18FA',
    '19SP', '19FA', '20SP', '20FA', '21SP', '21FA',
    '22SP', '22FA', '23SP', '23FA'
  ];

  console.log('📊 Current season counts in Sale table:');
  const salesBySeasonBefore = await prisma.sale.groupBy({
    by: ['season'],
    _count: { id: true },
    orderBy: { season: 'asc' }
  });

  for (const s of salesBySeasonBefore) {
    const marker = seasonsToDelete.includes(s.season) ? '❌ DELETE' : '✅ KEEP';
    console.log('  ', s.season, '-', s._count.id, 'records', marker);
  }

  console.log('\n🗑️  Deleting old seasons from all tables...\n');

  // Delete from Sale table
  const salesDeleted = await prisma.sale.deleteMany({
    where: { season: { in: seasonsToDelete } }
  });
  console.log('  Sale:', salesDeleted.count, 'records deleted');

  // Delete from Product table
  const productsDeleted = await prisma.product.deleteMany({
    where: { season: { in: seasonsToDelete } }
  });
  console.log('  Product:', productsDeleted.count, 'records deleted');

  // Delete from Pricing table
  const pricingDeleted = await prisma.pricing.deleteMany({
    where: { season: { in: seasonsToDelete } }
  });
  console.log('  Pricing:', pricingDeleted.count, 'records deleted');

  // Delete from Cost table
  const costsDeleted = await prisma.cost.deleteMany({
    where: { season: { in: seasonsToDelete } }
  });
  console.log('  Cost:', costsDeleted.count, 'records deleted');

  console.log('\n📊 Remaining season counts in Sale table:');
  const salesBySeasonAfter = await prisma.sale.groupBy({
    by: ['season'],
    _count: { id: true },
    orderBy: { season: 'asc' }
  });

  for (const s of salesBySeasonAfter) {
    console.log('  ', s.season, '-', s._count.id, 'records');
  }

  console.log('\n✅ Cleanup complete!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
