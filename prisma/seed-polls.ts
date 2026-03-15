/**
 * Seed only the polls table — safe to run on production
 * without touching shelters or animals.
 *
 * Uses upsert to preserve existing votes when re-seeding.
 *
 * Usage: npx tsx prisma/seed-polls.ts
 */
import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

async function main() {
    // Ordered by senior relevance: most directly impactful first
    const polls = [
        /* ─── 1. Directly about senior shelter animals ─── */
        {
            slug: 'age-based-adoption-fees',
            sortOrder: 1,
            title: 'Waiving adoption fees for senior pets',
            statement:
                'Senior pets (typically 7+ years) are the least likely to be adopted and the most likely to be euthanized. Some shelters waive adoption fees entirely for senior animals, while others worry this devalues the animal or attracts adopters who cannot afford ongoing vet care.',
            seniorNote: 'Fee waivers directly target the adoption gap that puts older animals on euthanasia lists.',
            forTitle: 'I support waived fees for seniors',
            forArgument:
                'Senior pets wait 4x longer than puppies for adoption. Fee waivers remove a barrier without reducing post-adoption commitment — studies show senior adopters have comparable or higher retention rates. The cost of sheltering a senior animal for months far exceeds a waived $75 fee.',
            againstTitle: 'I oppose blanket fee waivers',
            againstArgument:
                'Adoption fees help offset spay/neuter and vaccination costs that the shelter has already incurred. Waiving fees can attract impulse adopters. A better approach is to offer senior pet packages that include discounted veterinary follow-ups, ensuring the adopter is prepared for the commitment.',
        },
        {
            slug: 'senior-pet-veterinary-subsidies',
            sortOrder: 2,
            title: 'Government-funded veterinary care for senior shelter animals',
            statement:
                'Senior shelter animals often require more medical attention than younger ones — dental cleanings, bloodwork, arthritis management, and tumor removals that many shelters cannot afford. Some advocates propose government subsidies to cover geriatric veterinary care for shelter animals.',
            seniorNote: 'Senior animals are euthanized not because they are unadoptable, but because shelters cannot afford to treat their manageable conditions.',
            forTitle: 'I support veterinary subsidies',
            forArgument:
                'A $500 dental cleaning can make a 10-year-old dog adoptable overnight. Public funding for senior pet care would save lives and reduce the long-term cost of sheltering.',
            againstTitle: 'I oppose government subsidies',
            againstArgument:
                'Taxpayer-funded veterinary care for shelter animals sets a precedent that is difficult to sustain. Limited public funds are better spent on spay/neuter programs that prevent shelter intake in the first place. Private rescue organizations and donor-funded programs are better positioned to provide targeted geriatric care.',
        },
        {
            slug: 'veterinary-cost-crisis',
            sortOrder: 3,
            title: 'Veterinary cost transparency and regulation',
            statement:
                'Veterinary costs in the U.S. have risen over 60% in the past decade, outpacing general inflation. Emergency vet visits now average $800–$1,500, and chronic conditions common in senior pets — like kidney disease or diabetes — can cost thousands annually. There is no federal regulation of veterinary pricing, and cost is the #1 reason pet owners surrender animals to shelters.',
            seniorNote: 'Senior pets require more frequent vet care — when owners cannot afford treatment, older animals are the first surrendered and the last adopted.',
            forTitle: 'I support veterinary cost regulation',
            forArgument:
                'Veterinary medicine has consolidated rapidly — corporate chains now own over 30% of practices and have raised prices aggressively. Price transparency laws, similar to healthcare regulations, would let pet owners compare costs. Subsidized preventive care programs reduce expensive emergency visits and shelter surrenders.',
            againstTitle: 'I oppose price regulation',
            againstArgument:
                'Veterinary medicine is a private market and regulation could reduce investment in innovation and rural practice expansion. Rising costs reflect better diagnostics, treatments, and specialization. Pet insurance and nonprofit programs are better solutions than government price controls that could reduce quality of care.',
        },
        {
            slug: 'shelter-euthanasia-moratorium',
            sortOrder: 4,
            title: 'Shelter euthanasia moratoriums',
            statement:
                'Some cities have explored or enacted moratoriums on shelter euthanasia for adoptable animals, pushing toward "no-kill" status (defined as saving 90%+ of intake). Critics say these policies can lead to overcrowded, underfunded shelters that harm animal welfare.',
            seniorNote: 'Seniors are the first to be euthanized when shelters reach capacity — moratoriums buy them the time they desperately need.',
            forTitle: 'I support euthanasia moratoriums',
            forArgument:
                'No healthy, adoptable animal should die because of shelter overcrowding. Cities like Austin and Reno achieved no-kill status through community partnerships, foster programs, and spay/neuter outreach — proving it is possible. Moratoriums push shelters to find better solutions.',
            againstTitle: 'I oppose blanket moratoriums',
            againstArgument:
                'Moratoriums without adequate funding lead to warehouse shelters where animals languish in small cages for months or years. Quality of life matters — a crowded, stressed animal suffers differently but meaningfully. Resources should go to prevention, not just warehousing.',
        },
        {
            slug: 'shelter-transparency-reporting',
            sortOrder: 5,
            title: 'Mandatory shelter data reporting',
            statement:
                'Only 12 U.S. states require animal shelters to publicly report intake, adoption, euthanasia, and live-release rates. Advocates say transparency is essential to accountability; some shelters argue reporting burdens are unfair without additional funding.',
            seniorNote: 'Without age-disaggregated data, the disproportionate euthanasia of senior animals remains invisible to the public.',
            forTitle: 'I support mandatory reporting',
            forArgument:
                'Public shelters spend taxpayer money — the public deserves to see outcomes. A national reporting standard was established in 2004, but participation is voluntary. States with mandatory reporting like California and Virginia have seen measurable improvements in save rates.',
            againstTitle: 'I oppose mandatory reporting',
            againstArgument:
                'Reporting without context is misleading. A shelter that takes in aggressive animals other shelters refuse will have a higher euthanasia rate — that does not make it worse. Unfunded mandates divert staff time from animal care to paperwork. Voluntary reporting with community trust is more productive.',
        },
        {
            slug: 'good-samaritan-rescue-laws',
            sortOrder: 6,
            title: 'Good Samaritan laws for animal rescue',
            statement:
                'Several states have enacted or are considering "Good Samaritan" laws that protect civilians from liability when they rescue animals in immediate danger — such as dogs left in hot cars or animals found in neglectful conditions.',
            seniorNote: 'Senior animals are the most vulnerable to heat exposure and neglect — they are less likely to survive waiting for official intervention.',
            forTitle: 'I support Good Samaritan protections',
            forArgument:
                'Animals die in hot cars every summer because bystanders fear legal consequences. Good Samaritan laws empower citizens to act when minutes matter. Over a dozen states already have these protections and they have not led to increased property damage or abuse of the law.',
            againstTitle: 'I oppose civilian rescue authority',
            againstArgument:
                'Allowing civilians to break into vehicles or enter private property creates liability risks and potential for abuse. Existing laws allow emergency responders to act. Well-meaning but untrained rescuers can injure the animal or themselves. Better enforcement of existing cruelty laws is the solution.',
        },
        /* ─── Indirectly impacts seniors ─── */
        {
            slug: 'housing-pet-restrictions',
            sortOrder: 7,
            title: 'Banning pet breed restrictions in rentals',
            statement:
                'Many landlords and homeowner associations prohibit specific breeds or impose weight limits. An estimated 25% of pets surrendered to shelters are given up due to housing restrictions.',
            seniorNote: 'Older pets surrendered due to housing changes are the hardest to re-home and the most likely to be euthanized.',
            forTitle: 'I support banning breed restrictions',
            forArgument:
                'Housing restrictions are the #1 reason owners surrender dogs to shelters. Breed bans in rentals are based on the same flawed logic as breed-specific bans — punishing appearance, not behavior. Insurance data does not support breed-based risk assessment. Liability should be based on individual animal history.',
            againstTitle: 'I oppose banning breed restrictions',
            againstArgument:
                'Property owners have a right to set rules for their property. Insurance companies charge higher premiums for certain breeds, and landlords should not be forced to absorb that cost. Tenants with restricted breeds can seek pet-friendly housing — the market should decide, not legislation.',
        },
        {
            slug: 'pet-store-sales-ban',
            sortOrder: 8,
            title: 'Banning pet store puppy sales',
            statement:
                'Over 400 U.S. localities have banned the retail sale of commercially bred dogs and cats in pet stores, requiring stores to partner with shelters instead.',
            seniorNote: 'The commercial breeding pipeline creates a steady supply of puppies that absorbs adopter demand, leaving senior shelter animals overlooked.',
            forTitle: 'I support pet store bans',
            forArgument:
                'The majority of pet store puppies come from commercial mills with documented welfare violations. Retail incentivizes impulse purchases and volume breeding. Shelter partnerships in stores have proven successful — Petco and PetSmart both switched exclusively to adoption events.',
            againstTitle: 'I oppose pet store bans',
            againstArgument:
                'Bans push buyers online where there is even less oversight and more fraud. Responsible small breeders are already excluded from pet stores. The real problem is enforcing federal breeder inspections, not the retail venue. Consumers should have the right to choose their pet source.',
        },
        {
            slug: 'mandatory-spay-neuter',
            sortOrder: 9,
            title: 'Mandatory spay/neuter laws',
            statement:
                'Several U.S. cities and counties require all pet dogs and cats to be spayed or neutered by a certain age, with exemptions for licensed breeders and show animals.',
            seniorNote: 'Unaltered animals produce litters that flood shelters, pushing senior animals further down adoption queues and closer to euthanasia lists.',
            forTitle: 'I support mandatory spay/neuter',
            forArgument:
                'Mandatory spay/neuter directly reduces the number of unwanted litters entering the shelter system. Los Angeles saw shelter euthanasia drop by over 50% in the decade after its 2008 ordinance. Fewer homeless animals means fewer taxpayer dollars spent on sheltering and euthanasia.',
            againstTitle: 'I oppose mandatory spay/neuter',
            againstArgument:
                'Recent veterinary research suggests early spay/neuter can increase cancer risk and joint disorders, especially in large breeds. Mandatory laws disproportionately affect low-income pet owners who cannot afford the procedure and may avoid licensing or veterinary care entirely.',
        },
        /* ─── Systemic / broader policy ─── */
        {
            slug: 'breed-specific-legislation',
            sortOrder: 10,
            title: 'Breed-specific bans',
            statement:
                'Over 900 U.S. cities have passed laws banning or restricting ownership of specific dog breeds like pit bulls, Rottweilers, and others deemed dangerous. Major animal organizations including the ASPCA have opposed breed-specific bans.',
            seniorNote: 'Senior pit bull-type dogs are already the hardest demographic to place — breed bans make their adoption nearly impossible.',
            forTitle: 'I support breed-specific rules',
            forArgument:
                'Pit bull-type dogs account for a disproportionate share of severe bite injuries. Cities with breed-specific rules report fewer hospitalizations from dog attacks. Public safety must be the priority, and these rules give animal control officers clearer enforcement guidelines.',
            againstTitle: 'I oppose breed-specific bans',
            againstArgument:
                'Breed-specific bans punish dogs for their appearance, not behavior. Studies show no reduction in overall bite rates after these bans are enacted. Breed identification is unreliable — visual identification is wrong over 60% of the time. Laws that focus on a dog\'s actual behavior are more effective and fair.',
        },
        {
            slug: 'animal-limits-per-household',
            sortOrder: 11,
            title: 'County-level animal limits',
            statement:
                'Counties across the United States set limits on the number of domestic animals per household, often differentiating by species and property size. These ordinances vary widely — from 2 dogs in some urban areas to no limit in rural zones.',
            seniorNote: 'When families hit these limits, senior pets are often the first surrendered because they are seen as less adoptable.',
            forTitle: 'I support animal limits',
            forArgument:
                'Animal limits protect animal welfare by preventing hoarding situations, reduce neighborhood noise and sanitation complaints, and ensure owners have the resources to properly care for each pet. Overcrowded households are a leading source of shelter intakes — limits help reduce the shelter population crisis.',
            againstTitle: 'I oppose animal limits',
            againstArgument:
                'Blanket limits penalize responsible multi-pet owners and rescuers. Enforcement is inconsistent and often only triggered by complaints, making it selectively punitive. Instead of caps, better outcomes come from education, accessible vet care, and enforcing existing neglect and nuisance laws.',
        },
    ];

    let created = 0;
    let updated = 0;

    for (const poll of polls) {
        const existing = await prisma.poll.findUnique({ where: { slug: poll.slug } });
        if (existing) {
            await prisma.poll.update({
                where: { slug: poll.slug },
                data: {
                    ...poll,
                    neitherTitle: "It's not that simple",
                    neitherPrompt: "Here's what needs to change:",
                    active: true,
                },
            });
            updated++;
        } else {
            await prisma.poll.create({
                data: {
                    ...poll,
                    neitherTitle: "It's not that simple",
                    neitherPrompt: "Here's what needs to change:",
                    active: true,
                },
            });
            created++;
        }
    }

    // Deactivate removed polls
    const activeSlugs = polls.map(p => p.slug);
    const deactivated = await prisma.poll.updateMany({
        where: {
            slug: { notIn: activeSlugs },
            active: true,
        },
        data: { active: false },
    });
    if (deactivated.count > 0) {
        console.log(`  ↳ Deactivated ${deactivated.count} removed poll(s)`);
    }

    console.log(`✅ Polls seeded: ${created} created, ${updated} updated (votes preserved)`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
