import type { Metadata } from 'next';
import Image from 'next/image';

export const revalidate = 3600;

export const metadata: Metadata = {
    title: 'About | Golden Years Club',
    description: 'Surfacing senior animals on shelter euthanasia lists — giving them visibility, dignity, and a last chance.',
};

export default function AboutPage() {
    return (
        <section className="about-minimal">
            <div className="container" style={{ textAlign: 'center', marginBottom: 'var(--space-2xl)' }}>
                <span className="page-badge">📖 About</span>
                {/* TODO: Update to 2025 figures once finalized (preliminary ~597k) */}
                <p style={{ fontSize: 'var(--font-size-2xl)', color: 'var(--color-text)', lineHeight: 1.5, maxWidth: 680, margin: 'var(--space-lg) auto 0', fontWeight: 300 }}>
                    In 2024, 607,000 animals were euthanized at shelters in the United States. That averages out to roughly 1,660 dogs and cats per day.
                </p>
            </div>

            <div className="container about-story">
                {/* Row 1: donut image left, intro text right */}
                <div className="about-story__row">
                    <div className="about-story__media">
                        <Image
                            src="/henry-donut.jpg"
                            alt="Henry the senior German Shepherd curled up on his donut bed"
                            width={1024}
                            height={768}
                            priority
                        />
                    </div>
                    <div className="about-story__copy">
                        <p style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-gold)' }}>Here&apos;s Henry.</p>
                        <p>
                            When we adopted him from <a href="https://www.austinpetsalive.org" target="_blank" rel="noopener noreferrer" className="about-story__link--gold">Austin Pets Alive!</a>, they approximated his age to be 7 years old. It was a believable age. An <a href="https://embarkvet.com" target="_blank" rel="noopener noreferrer" className="about-story__link">Embark</a> test a few months later revealed he was closer to 10 years old and his heartworm was more progressed than we knew, in part due to a genetic condition that had been previously unknown.
                        </p>
                        <p>
                            We adopted him thinking we had at most 3 years with him. In the end, we only had 10 months together. It made us realize how close he had been to passing without the loving home he deserved.
                        </p>
                    </div>
                </div>

                {/* Row 2: text left, derp image right */}
                <div className="about-story__row about-story__row--reverse">
                    <div className="about-story__media">
                        <Image
                            src="/henry-chew.jpg"
                            alt="Henry chewing his favorite toy on the patio"
                            width={1024}
                            height={768}
                        />
                    </div>
                    <div className="about-story__copy">
                        <p style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-gold)' }}>1 in 5 don&apos;t make it out</p>
                        <p>
                            In 2024, the national save rate for dogs and cats was 82% — meaning <span style={{ color: 'var(--color-gold)', fontWeight: 600 }}>nearly 1 in 5 animals entering a shelter or rescue did not make it out alive</span>. Of the 5.8 million who entered, 607,000 were euthanized.
                        </p>
                        <p>
                            Seniors bear the worst of it. Dogs over 9 years old are <span style={{ color: 'var(--color-gold)', fontWeight: 600 }}>half as likely to leave a shelter alive</span> compared to puppies, with only about 25% of senior dogs ever getting adopted. They stay longer, get overlooked more, and when space runs out, they&apos;re usually first on the list.
                        </p>
                        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-dim)', fontStyle: 'italic' }}>
                            Source: <a href="https://www.aspca.org/helping-people-pets/shelter-intake-and-surrender/pet-statistics" target="_blank" rel="noopener noreferrer" className="about-story__link">ASPCA, 2024 Shelter Animal Statistics</a>
                        </p>
                    </div>
                </div>

                {/* Row 3: chew image left, mission text right */}
                <div className="about-story__row">
                    <div className="about-story__media about-story__media--portrait">
                        <Image
                            src="/henry-derp.jpg"
                            alt="Henry with his tongue out, looking goofy"
                            width={768}
                            height={1024}
                        />
                    </div>
                    <div className="about-story__copy">
                        <p>
                            After Henry passed, we started paying more attention to the quiet seniors with cloudy eyes and gray muzzles who sit quietly besides their owners at outdoor cafes while everyone walks past. We knew from experience that they don&apos;t require much, mostly a warm bed, healthy meals, and a stable source of love.
                        </p>

                        <p>
                            Henry was our proof that the best years are yet to come. <a href="https://sniffhome.org" target="_blank" rel="noopener noreferrer" className="about-story__link--gold" style={{ fontWeight: 700 }}>Sniff</a> at <a href="https://sniffhome.org" target="_blank" rel="noopener noreferrer" className="about-story__link--gold" style={{ fontWeight: 700 }}>sniffhome.org</a> was built in his honor, and Golden Years Club is a continuation of this work honoring our beloved family members.
                        </p>
                    </div>
                </div>

                {/* Row 4: text left, clouds image right */}
                <div className="about-story__row about-story__row--reverse">
                    <div className="about-story__media">
                        <Image
                            src="/henry-clouds.jpg"
                            alt="Henry resting peacefully on a blanket with clouds pattern"
                            width={1024}
                            height={768}
                        />
                    </div>
                    <div className="about-story__copy">
                        <p style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-gold)' }}>Technology for Good</p>
                        <p>
                            Golden Years Club is more than a website. It uses a novel combination of computer vision, veterinary-grade health schemas, and multi-source data aggregation to surface the animals that need help the most. Every listing photo is assessed blind which eliminates anchoring bias and provides an independent clinical signal from images alone.
                        </p>
                        <p>
                            Animal records are deduplicated across adoption platforms using perceptual hashing and reconciled into a single identity per animal. Health assessments are captured longitudinally, making it possible to detect changes in condition over time rather than relying on a single point-in-time observation.
                        </p>
                    </div>
                </div>

                {/* Row 5: vacation image left, tech text right */}
                <div className="about-story__row">
                    <div className="about-story__media about-story__media--portrait">
                        <Image
                            src="/henry-vacation.jpg"
                            alt="Henry sitting outdoors in Joshua Tree"
                            width={1418}
                            height={2214}
                        />
                    </div>
                    <div className="about-story__copy">
                        <p style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-gold)', marginBottom: 'var(--space-xs)' }}>Stack:</p>
                        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 var(--space-md) 0', fontSize: 'var(--font-size-base)', color: 'var(--color-text-muted)', lineHeight: 2 }}>
                            <li>▸ Next.js · React · TypeScript</li>
                            <li>▸ Gemini 2.5 (structured output)</li>
                            <li>▸ PostgreSQL · Prisma</li>
                            <li>▸ Sharp (perceptual hashing)</li>
                            <li>▸ Railway · GitHub Actions</li>
                        </ul>
                        <p>
                            Golden Years Club is part of the same family of work as <a href="https://sniffhome.org" target="_blank" rel="noopener noreferrer" className="about-story__link--gold" style={{ fontWeight: 700 }}>Sniff</a>. The Sniff API taps into Golden Years Club&apos;s database to help owners search for their lost pet. Both projects are open source.
                        </p>
                        <p>Visit them here:</p>
                        <p>
                            → <a href="https://github.com/oracle000-om/golden-years" target="_blank" rel="noopener noreferrer" className="about-story__link--gold">Golden Years Club</a><br />
                            → <a href="https://github.com/oracle000-om/sniff-api" target="_blank" rel="noopener noreferrer" className="about-story__link--gold">Sniff</a>
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}
