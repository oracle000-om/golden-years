/**
 * Rewrite broken S3 photo URLs → working CloudFront CDN URLs.
 */
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const S3_HOST = 'npus-pr-petfusbbc-pdp-media-service-public-use1-sss.s3.amazonaws.com';
const CF_HOST = 'dbw3zep4prcju.cloudfront.net';

const connStr = process.env.DATABASE_URL!;
const pool = new pg.Pool({
    connectionString: connStr,
    ssl: connStr.includes('.rlwy.net') ? { rejectUnauthorized: false } : undefined,
});
const adapter = new PrismaPg(pool);
const prisma = new (PrismaClient as any)({ adapter });

async function main() {
    // 1. Rewrite photo_url
    const photoResult = await prisma.$executeRawUnsafe(
        `UPDATE animals SET photo_url = REPLACE(photo_url, '${S3_HOST}', '${CF_HOST}') WHERE photo_url LIKE '%${S3_HOST}%'`
    );
    console.log(`Updated photo_url on ${photoResult} animals`);

    // 2. Rewrite photo_urls (text array)
    const photosResult = await prisma.$executeRawUnsafe(
        `UPDATE animals SET photo_urls = array(
       SELECT REPLACE(u, '${S3_HOST}', '${CF_HOST}') FROM unnest(photo_urls) AS u
     ) WHERE array_to_string(photo_urls, ',') LIKE '%${S3_HOST}%'`
    );
    console.log(`Updated photo_urls on ${photosResult} animals`);

    // 3. Verify
    const remaining = await prisma.animal.count({
        where: { photoUrl: { contains: S3_HOST } },
    });
    console.log(`Remaining with S3 URLs: ${remaining}`);

    // 4. Spot-check
    const samples = await prisma.animal.findMany({
        where: { photoUrl: { contains: CF_HOST } },
        select: { name: true, photoUrl: true },
        take: 3,
    });
    console.log('\nSample URLs:');
    for (const s of samples) {
        console.log(`  ${s.name}: ${s.photoUrl?.substring(0, 100)}`);
    }

    await prisma.$disconnect();
    await pool.end();
}

main().catch(console.error);
