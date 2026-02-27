import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';

async function main() {
    const p = await createPrismaClient();

    const byType = await (p as any).$queryRaw`
        SELECT shelter_type, 
               COUNT(*)::int as total,
               COUNT(CASE WHEN address IS NOT NULL AND address != '' THEN 1 END)::int as with_addr
        FROM shelters 
        GROUP BY shelter_type 
        ORDER BY total DESC
    `;
    console.log('By shelter type:');
    for (const r of byType as any[]) {
        console.log(`  ${r.shelter_type}: ${r.total} total, ${r.with_addr} with address`);
    }

    // Sample shelters without addresses
    const missing = await (p as any).$queryRaw`
        SELECT name, state, county, id
        FROM shelters 
        WHERE address IS NULL OR address = ''
        ORDER BY name
        LIMIT 30
    `;
    console.log(`\nSample shelters missing address (first 30):`);
    for (const s of missing as any[]) {
        console.log(`  ${s.name} | ${s.county}, ${s.state}`);
    }

    await p.$disconnect();
}
main();
