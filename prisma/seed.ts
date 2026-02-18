import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new (PrismaClient as any)({ adapter });

async function main() {
    // Clear existing data
    await prisma.source.deleteMany();
    await prisma.animal.deleteMany();
    await prisma.shelter.deleteMany();

    // Create shelters
    const shelter1 = await prisma.shelter.create({
        data: {
            name: 'Los Angeles County Animal Care',
            county: 'Los Angeles',
            state: 'CA',
            address: '5898 Cherry Ave, Long Beach, CA 90805',
            phone: '(562) 728-4610',
            websiteUrl: 'https://animalcare.lacounty.gov',
            totalIntakeYtd: 4200,
            totalEuthanizedYtd: 1680,
            trustScore: 40,
        },
    });

    const shelter2 = await prisma.shelter.create({
        data: {
            name: 'Harris County Animal Shelter',
            county: 'Harris',
            state: 'TX',
            address: '612 Canino Rd, Houston, TX 77076',
            phone: '(281) 999-3191',
            websiteUrl: 'https://countypets.com',
            totalIntakeYtd: 3800,
            totalEuthanizedYtd: 2660,
            trustScore: 70,
        },
    });

    const shelter3 = await prisma.shelter.create({
        data: {
            name: 'Maricopa County Animal Care',
            county: 'Maricopa',
            state: 'AZ',
            address: '2500 S 27th Ave, Phoenix, AZ 85009',
            phone: '(602) 506-7387',
            websiteUrl: 'https://maricopa.gov/animals',
            totalIntakeYtd: 2900,
            totalEuthanizedYtd: 580,
            trustScore: 20,
        },
    });

    // Helper to create future dates
    const hoursFromNow = (h: number) => new Date(Date.now() + h * 60 * 60 * 1000);
    const daysAgo = (d: number) => new Date(Date.now() - d * 24 * 60 * 60 * 1000);

    // Create animals
    const animals = [
        {
            shelterId: shelter1.id,
            intakeId: 'A5892341',
            name: 'Buddy',
            species: 'DOG' as const,
            breed: 'Golden Retriever mix',
            sex: 'MALE' as const,
            size: 'LARGE' as const,
            photoUrl: '/seed/buddy.jpg',
            status: 'LISTED' as const,
            ageKnownYears: 11,
            ageSource: 'SHELTER_REPORTED' as const,
            notes: 'Surrendered by owner. Gentle disposition. Good with other dogs.',
            intakeDate: daysAgo(14),
            euthScheduledAt: hoursFromNow(18),
        },
        {
            shelterId: shelter1.id,
            intakeId: 'A5892387',
            name: 'Whiskers',
            species: 'CAT' as const,
            breed: 'Domestic Shorthair',
            sex: 'FEMALE' as const,
            size: 'SMALL' as const,
            photoUrl: '/seed/whiskers.jpg',
            status: 'URGENT' as const,
            ageKnownYears: 14,
            ageSource: 'SHELTER_REPORTED' as const,
            notes: 'Found as stray. Very affectionate. Has mild arthritis.',
            intakeDate: daysAgo(21),
            euthScheduledAt: hoursFromNow(8),
        },
        {
            shelterId: shelter2.id,
            intakeId: 'HC-2026-4421',
            name: 'Duke',
            species: 'DOG' as const,
            breed: 'Pit Bull Terrier',
            sex: 'MALE' as const,
            size: 'LARGE' as const,
            photoUrl: '/seed/duke.jpg',
            status: 'LISTED' as const,
            ageEstimatedLow: 8,
            ageEstimatedHigh: 10,
            ageConfidenceScore: 0.82,
            ageSource: 'CV_ESTIMATED' as const,
            notes: 'Stray intake. Calm demeanor. Kennel-trained.',
            intakeDate: daysAgo(10),
            euthScheduledAt: hoursFromNow(42),
        },
        {
            shelterId: shelter2.id,
            intakeId: 'HC-2026-4435',
            name: 'Sadie',
            species: 'DOG' as const,
            breed: 'Chihuahua mix',
            sex: 'FEMALE' as const,
            size: 'SMALL' as const,
            photoUrl: '/seed/sadie.jpg',
            status: 'LISTED' as const,
            ageKnownYears: 12,
            ageSource: 'SHELTER_REPORTED' as const,
            notes: 'Owner deceased. Very bonded to people. Needs quiet home.',
            intakeDate: daysAgo(7),
            euthScheduledAt: hoursFromNow(66),
        },
        {
            shelterId: shelter3.id,
            intakeId: 'MC-89012',
            name: 'Shadow',
            species: 'CAT' as const,
            breed: 'Domestic Longhair',
            sex: 'MALE' as const,
            size: 'MEDIUM' as const,
            photoUrl: '/seed/shadow.jpg',
            status: 'LISTED' as const,
            ageEstimatedLow: 10,
            ageEstimatedHigh: 13,
            ageConfidenceScore: 0.71,
            ageSource: 'CV_ESTIMATED' as const,
            notes: 'Found in abandoned building. Shy but warms up quickly.',
            intakeDate: daysAgo(5),
            euthScheduledAt: hoursFromNow(120),
        },
        {
            shelterId: shelter3.id,
            intakeId: 'MC-89045',
            name: 'Bear',
            species: 'DOG' as const,
            breed: 'German Shepherd',
            sex: 'MALE' as const,
            size: 'XLARGE' as const,
            photoUrl: '/seed/bear.jpg',
            status: 'URGENT' as const,
            ageKnownYears: 9,
            ageSource: 'SHELTER_REPORTED' as const,
            notes: 'Surrendered due to landlord restrictions. Trained, obedient.',
            intakeDate: daysAgo(18),
            euthScheduledAt: hoursFromNow(12),
        },
        {
            shelterId: shelter1.id,
            intakeId: 'A5892412',
            name: 'Patches',
            species: 'CAT' as const,
            breed: 'Calico',
            sex: 'FEMALE' as const,
            size: 'SMALL' as const,
            photoUrl: '/seed/patches.jpg',
            status: 'LISTED' as const,
            ageKnownYears: 15,
            ageSource: 'SHELTER_REPORTED' as const,
            notes: 'Surrendered with sibling (adopted separately). Loves laps.',
            intakeDate: daysAgo(12),
            euthScheduledAt: hoursFromNow(36),
        },
        {
            shelterId: shelter2.id,
            intakeId: 'HC-2026-4450',
            name: null,
            species: 'DOG' as const,
            breed: 'Labrador Retriever mix',
            sex: 'MALE' as const,
            size: 'LARGE' as const,
            photoUrl: '/seed/unnamed.jpg',
            status: 'LISTED' as const,
            ageSource: 'UNKNOWN' as const,
            notes: 'Stray. No microchip. Appears senior based on grey muzzle.',
            intakeDate: daysAgo(3),
            euthScheduledAt: hoursFromNow(90),
        },
    ];

    for (const animal of animals) {
        await prisma.animal.create({
            data: {
                ...animal,
                sources: {
                    create: {
                        sourceType: 'SHELTER_WEBSITE',
                        sourceUrl: `https://example.com/animal/${animal.intakeId}`,
                    },
                },
            },
        });
    }

    console.log('✅ Seed data created successfully');
    console.log(`   ${3} shelters`);
    console.log(`   ${animals.length} animals`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
