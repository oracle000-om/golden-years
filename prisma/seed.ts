import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { californiaShelters } from './seeds/california-shelters';
import { texasShelters } from './seeds/texas-shelters';
import { floridaShelters } from './seeds/florida-shelters';
import { newYorkShelters } from './seeds/new-york-shelters';
import { georgiaShelters } from './seeds/georgia-shelters';
import { northCarolinaShelters } from './seeds/north-carolina-shelters';
// Phase 2
import { ohioShelters } from './seeds/ohio-shelters';
import { pennsylvaniaShelters } from './seeds/pennsylvania-shelters';
import { virginiaShelters } from './seeds/virginia-shelters';
import { southCarolinaShelters } from './seeds/south-carolina-shelters';
import { tennesseeShelters } from './seeds/tennessee-shelters';
import { louisianaShelters } from './seeds/louisiana-shelters';
import { alabamaShelters } from './seeds/alabama-shelters';
import { michiganShelters } from './seeds/michigan-shelters';
// Phase 3
import { arizonaShelters } from './seeds/arizona-shelters';
import { indianaShelters } from './seeds/indiana-shelters';
import { missouriShelters } from './seeds/missouri-shelters';
import { illinoisShelters } from './seeds/illinois-shelters';
import { coloradoShelters } from './seeds/colorado-shelters';
import { wisconsinShelters } from './seeds/wisconsin-shelters';
import { minnesotaShelters } from './seeds/minnesota-shelters';
import { oklahomaShelters } from './seeds/oklahoma-shelters';
// Phase 4
import { washingtonShelters } from './seeds/washington-shelters';
import { oregonShelters } from './seeds/oregon-shelters';
import { nevadaShelters } from './seeds/nevada-shelters';
import { newMexicoShelters } from './seeds/new-mexico-shelters';
import { mississippiShelters } from './seeds/mississippi-shelters';
import { arkansasShelters } from './seeds/arkansas-shelters';
import { kansasShelters } from './seeds/kansas-shelters';
import { kentuckyShelters } from './seeds/kentucky-shelters';
import { iowaShelters } from './seeds/iowa-shelters';
import { nebraskaShelters } from './seeds/nebraska-shelters';
// Phase 5
import { newJerseyShelters } from './seeds/new-jersey-shelters';
import { marylandShelters } from './seeds/maryland-shelters';
import { connecticutShelters } from './seeds/connecticut-shelters';
import { massachusettsShelters } from './seeds/massachusetts-shelters';
import { westVirginiaShelters, utahShelters, hawaiiShelters, idahoShelters, montanaShelters, delawareShelters, rhodeIslandShelters, dcShelters } from './seeds/small-states-shelters';
// Phase 6
import { maineShelters, newHampshireShelters, vermontShelters, wyomingShelters, northDakotaShelters, southDakotaShelters, alaskaShelters } from './seeds/rural-states-shelters';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = new (PrismaClient as any)({ adapter });

async function main() {
    // Clear existing data
    await prisma.pollVote.deleteMany();
    await prisma.poll.deleteMany();
    await prisma.source.deleteMany();
    await prisma.animal.deleteMany();
    await prisma.shelter.deleteMany();

    // ─── Seed shelters from state files ─────────────────────
    const allShelters = [
        ...californiaShelters, ...texasShelters, ...floridaShelters, ...newYorkShelters,
        ...georgiaShelters, ...northCarolinaShelters,
        ...ohioShelters, ...pennsylvaniaShelters, ...virginiaShelters, ...southCarolinaShelters,
        ...tennesseeShelters, ...louisianaShelters, ...alabamaShelters, ...michiganShelters,
        ...arizonaShelters, ...indianaShelters, ...missouriShelters, ...illinoisShelters,
        ...coloradoShelters, ...wisconsinShelters, ...minnesotaShelters, ...oklahomaShelters,
        ...washingtonShelters, ...oregonShelters, ...nevadaShelters, ...newMexicoShelters,
        ...mississippiShelters, ...arkansasShelters, ...kansasShelters, ...kentuckyShelters,
        ...iowaShelters, ...nebraskaShelters,
        ...newJerseyShelters, ...marylandShelters, ...connecticutShelters, ...massachusettsShelters,
        ...westVirginiaShelters, ...utahShelters, ...hawaiiShelters, ...idahoShelters,
        ...montanaShelters, ...delawareShelters, ...rhodeIslandShelters, ...dcShelters,
        ...maineShelters, ...newHampshireShelters, ...vermontShelters, ...wyomingShelters,
        ...northDakotaShelters, ...southDakotaShelters, ...alaskaShelters,
    ];
    const shelterMap: Record<string, string> = {}; // name → id

    for (const s of allShelters) {
        const created = await prisma.shelter.create({ data: s });
        shelterMap[created.name] = created.id;
    }

    console.log(`   🏠 ${allShelters.length} shelters seeded across 50 states + DC`);

    // Reference shelters for animal seed data
    const shelter1Id = shelterMap['Los Angeles County Animal Care'];
    const shelter2Id = shelterMap['OC Animal Care'];
    const shelter3Id = shelterMap['San Diego County Dept of Animal Services'];

    // Helper to create future dates
    const hoursFromNow = (h: number) => new Date(Date.now() + h * 60 * 60 * 1000);
    const daysAgo = (d: number) => new Date(Date.now() - d * 24 * 60 * 60 * 1000);

    // Create animals
    const animals = [
        {
            shelterId: shelter1Id,
            intakeId: 'A5892341',
            name: 'Buddy',
            species: 'DOG' as const,
            breed: 'Golden Retriever mix',
            sex: 'MALE' as const,
            size: 'LARGE' as const,
            photoUrl: '/seed/buddy.png',
            status: 'LISTED' as const,
            ageKnownYears: 11,
            ageSource: 'SHELTER_REPORTED' as const,
            intakeReason: 'OWNER_SURRENDER' as const,
            notes: 'Surrendered by owner. Gentle disposition. Good with other dogs.',
            intakeDate: daysAgo(14),
            euthScheduledAt: hoursFromNow(18),
        },
        {
            shelterId: shelter1Id,
            intakeId: 'A5892387',
            name: 'Whiskers',
            species: 'CAT' as const,
            breed: 'Domestic Shorthair',
            sex: 'FEMALE' as const,
            size: 'SMALL' as const,
            photoUrl: '/seed/whiskers.png',
            status: 'URGENT' as const,
            ageKnownYears: 14,
            ageSource: 'SHELTER_REPORTED' as const,
            intakeReason: 'STRAY' as const,
            notes: 'Found as stray. Very affectionate. Has mild arthritis.',
            intakeDate: daysAgo(21),
            euthScheduledAt: hoursFromNow(8),
        },
        {
            shelterId: shelter2Id,
            intakeId: 'HC-2026-4421',
            name: 'Duke',
            species: 'DOG' as const,
            breed: 'Pit Bull Terrier',
            sex: 'MALE' as const,
            size: 'LARGE' as const,
            photoUrl: '/seed/duke.png',
            status: 'LISTED' as const,
            ageEstimatedLow: 8,
            ageEstimatedHigh: 10,
            ageConfidence: 'HIGH' as const,
            ageIndicators: ['grey muzzle', 'cloudy eyes', 'reduced muscle mass'],
            ageSource: 'CV_ESTIMATED' as const,
            detectedBreeds: ['American Pit Bull Terrier'],
            breedConfidence: 'HIGH' as const,
            lifeExpectancyLow: 12,
            lifeExpectancyHigh: 16,
            intakeReason: 'STRAY' as const,
            notes: 'Stray intake. Calm demeanor. Kennel-trained.',
            intakeDate: daysAgo(10),
            euthScheduledAt: hoursFromNow(42),
        },
        {
            shelterId: shelter2Id,
            intakeId: 'HC-2026-4435',
            name: 'Sadie',
            species: 'DOG' as const,
            breed: 'Chihuahua mix',
            sex: 'FEMALE' as const,
            size: 'SMALL' as const,
            photoUrl: '/seed/sadie.png',
            status: 'LISTED' as const,
            ageKnownYears: 12,
            ageSource: 'SHELTER_REPORTED' as const,
            lifeExpectancyLow: 14,
            lifeExpectancyHigh: 17,
            intakeReason: 'OWNER_DECEASED' as const,
            intakeReasonDetail: 'Owner passed away, no family able to take her.',
            notes: 'Owner deceased. Very bonded to people. Needs quiet home.',
            intakeDate: daysAgo(7),
            euthScheduledAt: hoursFromNow(66),
        },
        {
            shelterId: shelter3Id,
            intakeId: 'MC-89012',
            name: 'Shadow',
            species: 'CAT' as const,
            breed: 'Domestic Longhair',
            sex: 'MALE' as const,
            size: 'MEDIUM' as const,
            photoUrl: '/seed/shadow.png',
            status: 'LISTED' as const,
            ageEstimatedLow: 10,
            ageEstimatedHigh: 13,
            ageConfidence: 'MEDIUM' as const,
            ageIndicators: ['cloudy eyes', 'thin coat'],
            ageSource: 'CV_ESTIMATED' as const,
            detectedBreeds: ['Domestic Longhair'],
            breedConfidence: 'MEDIUM' as const,
            lifeExpectancyLow: 12,
            lifeExpectancyHigh: 18,
            intakeReason: 'STRAY' as const,
            intakeReasonDetail: 'Found in abandoned building.',
            notes: 'Found in abandoned building. Shy but warms up quickly.',
            intakeDate: daysAgo(5),
            euthScheduledAt: hoursFromNow(120),
        },
        {
            shelterId: shelter3Id,
            intakeId: 'MC-89045',
            name: 'Bear',
            species: 'DOG' as const,
            breed: 'German Shepherd',
            sex: 'MALE' as const,
            size: 'XLARGE' as const,
            photoUrl: '/seed/bear.png',
            status: 'URGENT' as const,
            ageKnownYears: 9,
            ageSource: 'SHELTER_REPORTED' as const,
            intakeReason: 'OWNER_SURRENDER' as const,
            intakeReasonDetail: 'Surrendered due to landlord restrictions.',
            notes: 'Surrendered due to landlord restrictions. Trained, obedient.',
            intakeDate: daysAgo(18),
            euthScheduledAt: hoursFromNow(12),
        },
        {
            shelterId: shelter1Id,
            intakeId: 'A5892412',
            name: 'Patches',
            species: 'CAT' as const,
            breed: 'Calico',
            sex: 'FEMALE' as const,
            size: 'SMALL' as const,
            photoUrl: '/seed/patches.png',
            status: 'LISTED' as const,
            ageKnownYears: 15,
            ageSource: 'SHELTER_REPORTED' as const,
            intakeReason: 'OWNER_SURRENDER' as const,
            notes: 'Surrendered with sibling (adopted separately). Loves laps.',
            intakeDate: daysAgo(12),
            euthScheduledAt: hoursFromNow(36),
        },
        {
            shelterId: shelter2Id,
            intakeId: 'HC-2026-4450',
            name: null,
            species: 'DOG' as const,
            breed: 'Labrador Retriever mix',
            sex: 'MALE' as const,
            size: 'LARGE' as const,
            photoUrl: '/seed/unnamed.png',
            status: 'LISTED' as const,
            ageSource: 'UNKNOWN' as const,
            intakeReason: 'STRAY' as const,
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

    // --- Village Poll seed ---
    await prisma.pollVote.deleteMany();
    await prisma.poll.deleteMany();

    const polls = [
        {
            slug: 'animal-limits-per-household',
            title: 'County-level animal limits',
            statement:
                'Counties across the United States set limits on the number of domestic animals per household, often differentiating by species (e.g., dogs vs. cats) and property size. These ordinances vary widely — from 2 dogs in some urban areas to no limit in rural zones.',
            forTitle: 'I support animal limits',
            forArgument:
                'Animal limits protect animal welfare by preventing hoarding situations, reduce neighborhood noise and sanitation complaints, and ensure owners have the resources to properly care for each pet. Overcrowded households are a leading source of shelter intakes — limits help reduce the shelter population crisis.',
            againstTitle: 'I oppose animal limits',
            againstArgument:
                'Blanket limits penalize responsible multi-pet owners and rescuers. Enforcement is inconsistent and often only triggered by complaints, making it selectively punitive. Instead of caps, better outcomes come from education, accessible vet care, and enforcing existing neglect and nuisance laws.',
        },
        {
            slug: 'mandatory-spay-neuter',
            title: 'Mandatory spay/neuter laws',
            statement:
                'Several U.S. cities and counties require all pet dogs and cats to be spayed or neutered by a certain age, with exemptions for licensed breeders and show animals. Supporters cite reduced shelter intake; opponents argue it impacts pet health and removes owner choice.',
            forTitle: 'I support mandatory spay/neuter',
            forArgument:
                'Mandatory spay/neuter directly reduces the number of unwanted litters entering the shelter system. Los Angeles saw shelter euthanasia drop by over 50% in the decade after its 2008 ordinance. Fewer homeless animals means fewer taxpayer dollars spent on sheltering and euthanasia.',
            againstTitle: 'I oppose mandatory spay/neuter',
            againstArgument:
                'Recent veterinary research suggests early spay/neuter can increase cancer risk and joint disorders, especially in large breeds. Mandatory laws disproportionately affect low-income pet owners who cannot afford the procedure and may avoid licensing or veterinary care entirely.',
        },
        {
            slug: 'breed-specific-legislation',
            title: 'Breed-specific bans',
            statement:
                'Over 900 U.S. cities have enacted breed-specific legislation (BSL) targeting pit bulls, Rottweilers, and other breeds deemed dangerous. These laws can range from mandatory muzzling to full ownership bans. The CDC, ASPCA, and AKC have all opposed BSL.',
            forTitle: 'I support breed-specific rules',
            forArgument:
                'Pit bull-type dogs account for a disproportionate share of severe bite injuries. Municipalities with BSL report fewer hospitalizations from dog attacks. Public safety must be the priority, and breed-specific rules give animal control officers clearer enforcement guidelines.',
            againstTitle: 'I oppose breed-specific bans',
            againstArgument:
                'BSL punishes dogs for their appearance, not behavior. Studies show no reduction in overall bite rates after BSL enactment. Breed identification is unreliable — visual identification is wrong over 60% of the time. Behavior-based dangerous dog laws are more effective and fair.',
        },
        {
            slug: 'shelter-euthanasia-moratorium',
            title: 'Shelter euthanasia moratoriums',
            statement:
                'Some cities have explored or enacted moratoriums on shelter euthanasia for adoptable animals, pushing toward "no-kill" status (defined as saving 90%+ of intake). Critics say these policies can lead to overcrowded, underfunded shelters that harm animal welfare.',
            forTitle: 'I support euthanasia moratoriums',
            forArgument:
                'No healthy, adoptable animal should die because of shelter overcrowding. Cities like Austin and Reno achieved no-kill status through community partnerships, foster programs, and TNR — proving it is operationally possible. Moratoriums force the innovation shelters need.',
            againstTitle: 'I oppose blanket moratoriums',
            againstArgument:
                'Moratoriums without adequate funding lead to warehouse shelters where animals languish in small cages for months or years. Quality of life matters — a crowded, stressed animal suffers differently but meaningfully. Resources should go to prevention, not just warehousing.',
        },
        {
            slug: 'trap-neuter-return',
            title: 'Trap-Neuter-Return (TNR) for feral cats',
            statement:
                'TNR programs trap feral cats, sterilize them, and return them to their colonies. Proponents argue it humanely stabilizes populations; opponents cite the ecological damage feral cats cause to bird and wildlife populations — estimated at 1.3–4 billion birds per year in the U.S.',
            forTitle: 'I support TNR programs',
            forArgument:
                'TNR is the only proven humane method that actually reduces feral cat populations over time. Trap-and-kill approaches create a "vacuum effect" where new cats move into the territory. Managed colonies with TNR are healthier and have fewer nuisance complaints.',
            againstTitle: 'I oppose TNR programs',
            againstArgument:
                'Feral cats are an invasive predator responsible for the extinction of at least 63 species worldwide. TNR does not remove cats from the environment — it returns them to continue hunting. Limited resources for wildlife conservation are better spent on removal programs.',
        },
        {
            slug: 'pet-store-sales-ban',
            title: 'Banning pet store puppy sales',
            statement:
                'Over 400 U.S. localities have banned the retail sale of commercially bred dogs and cats in pet stores, requiring stores to partner with shelters instead. The federal government introduced the Puppy Protection Act in 2024 to set national standards for commercial breeders.',
            forTitle: 'I support pet store bans',
            forArgument:
                'The majority of pet store puppies come from commercial mills with documented welfare violations. Retail incentivizes impulse purchases and volume breeding. Shelter partnerships in stores have proven successful — Petco and PetSmart both switched exclusively to adoption events.',
            againstTitle: 'I oppose pet store bans',
            againstArgument:
                'Bans push buyers online where there is even less oversight and more fraud. Responsible small breeders are already excluded from pet stores. The real problem is USDA inspection enforcement, not the retail venue. Consumers should have the right to choose their pet source.',
        },
        {
            slug: 'shelter-transparency-reporting',
            title: 'Mandatory shelter data reporting',
            statement:
                'Only 12 U.S. states require animal shelters to publicly report intake, adoption, euthanasia, and live-release rates. Advocates say transparency is essential to accountability; some shelters argue reporting burdens are unfair without additional funding.',
            forTitle: 'I support mandatory reporting',
            forArgument:
                'Public shelters spend taxpayer money — the public deserves to see outcomes. The Asilomar Accords established a standard reporting framework in 2004, but adoption is voluntary. States with mandatory reporting like California and Virginia have seen measurable improvements in save rates.',
            againstTitle: 'I oppose mandatory reporting',
            againstArgument:
                'Reporting without context is misleading. A shelter that takes in aggressive animals other shelters refuse will have a higher euthanasia rate — that does not make it worse. Unfunded mandates divert staff time from animal care to paperwork. Voluntary reporting with community trust is more productive.',
        },
        {
            slug: 'age-based-adoption-fees',
            title: 'Waiving adoption fees for senior pets',
            statement:
                'Senior pets (typically 7+ years) are the least likely to be adopted and the most likely to be euthanized. Some shelters waive adoption fees entirely for senior animals, while others worry this devalues the animal or attracts adopters who cannot afford ongoing vet care.',
            forTitle: 'I support waived fees for seniors',
            forArgument:
                'Senior pets wait 4x longer than puppies for adoption. Fee waivers remove a barrier without reducing post-adoption commitment — studies show senior adopters have comparable or higher retention rates. The cost of sheltering a senior animal for months far exceeds a waived $75 fee.',
            againstTitle: 'I oppose blanket fee waivers',
            againstArgument:
                'Adoption fees help offset spay/neuter and vaccination costs that the shelter has already incurred. Waiving fees can attract impulse adopters. A better approach is to offer senior pet packages that include discounted veterinary follow-ups, ensuring the adopter is prepared for the commitment.',
        },
        {
            slug: 'tethering-laws',
            title: 'Anti-tethering legislation',
            statement:
                'Over 30 states have enacted laws regulating or banning the practice of tethering (chaining) dogs outdoors for extended periods. Violations can range from fines to animal seizure. The AVMA considers prolonged tethering a welfare concern, but enforcement varies widely.',
            forTitle: 'I support anti-tethering laws',
            forArgument:
                'Tethered dogs are 2.8x more likely to bite. Prolonged chaining causes physical injuries (embedded collars, muscle atrophy) and behavioral issues (aggression, anxiety). Anti-tethering laws protect both animals and communities — and they are straightforward to enforce through animal control.',
            againstTitle: 'I oppose tethering bans',
            againstArgument:
                'Rural and working-dog owners may have legitimate reasons for tethering. Broad bans ignore context — a farm dog on a long lead during the day is different from a neglected suburban dog on a short chain. Existing cruelty laws already cover the worst cases without criminalizing common practices.',
        },
        {
            slug: 'housing-pet-restrictions',
            title: 'Banning pet breed restrictions in rentals',
            statement:
                'Many landlords and HOAs prohibit specific breeds (typically pit bulls, German Shepherds, Dobermans) or impose weight limits. An estimated 25% of pets surrendered to shelters are given up due to housing restrictions. Some states are considering legislation to ban breed-based rental discrimination.',
            forTitle: 'I support banning breed restrictions',
            forArgument:
                'Housing restrictions are the #1 reason owners surrender dogs to shelters. Breed bans in rentals are based on the same flawed logic as BSL — punishing appearance, not behavior. Insurance data does not support breed-based risk assessment. Liability should be based on individual animal history.',
            againstTitle: 'I oppose banning breed restrictions',
            againstArgument:
                'Property owners have a right to set rules for their property. Insurance companies charge higher premiums for certain breeds, and landlords should not be forced to absorb that cost. Tenants with restricted breeds can seek pet-friendly housing — the market should decide, not legislation.',
        },
    ];

    for (const poll of polls) {
        await prisma.poll.create({
            data: {
                ...poll,
                neitherTitle: "It's not that simple",
                neitherPrompt: "Here's what needs to change:",
                active: true,
            },
        });
    }

    console.log(`   ${polls.length} village polls`);

}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
