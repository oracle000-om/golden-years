import { prisma } from './src/lib/db';

async function main() {
  const withAnimals = await prisma.shelter.count({
    where: { shelterType: 'MUNICIPAL', animals: { some: {} } }
  });
  const totalMunicipal = await prisma.shelter.count({ where: { shelterType: 'MUNICIPAL' } });
  const municipalWithStats = await prisma.shelter.count({ where: { shelterType: 'MUNICIPAL', totalIntakeAnnual: { gt: 0 } } });

  // Any MUNICIPAL shelter with both stats AND any animals at all
  const withStatsAndAnimals = await prisma.shelter.count({
    where: { shelterType: 'MUNICIPAL', totalIntakeAnnual: { gt: 0 }, animals: { some: {} } }
  });

  console.log('Total MUNICIPAL:', totalMunicipal);
  console.log('MUNICIPAL with stats:', municipalWithStats);
  console.log('MUNICIPAL with ANY animals:', withAnimals);
  console.log('MUNICIPAL with stats AND animals:', withStatsAndAnimals);

  // Sample some MUNICIPAL shelters that have animals
  const samples = await prisma.shelter.findMany({
    where: { shelterType: 'MUNICIPAL', totalIntakeAnnual: { gt: 0 }, animals: { some: { status: 'AVAILABLE' } } },
    select: { name: true, state: true, county: true, totalIntakeAnnual: true, totalEuthanizedAnnual: true, _count: { select: { animals: true } } },
    take: 10,
    orderBy: { name: 'asc' },
  });
  console.log('\nSamples of MUNICIPAL with stats+animals:');
  for (const s of samples) {
    const sr = s.totalIntakeAnnual > 0 ? Math.round((1 - s.totalEuthanizedAnnual / s.totalIntakeAnnual) * 100) : 0;
    console.log(`  ${s.name} (${s.county}, ${s.state}) - ${sr}% save rate, ${s._count.animals} animals`);
  }

  await prisma.$disconnect();
}
main();
