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
            <div className="container about-minimal__content">
                {/* Row 1: image left, text right */}
                <div className="about-minimal__image about-minimal__image--left">
                    <Image
                        src="/about-hero.jpg"
                        alt="Senior German Shepherd resting on a pink dog bed"
                        width={520}
                        height={390}
                        style={{ objectFit: 'cover', borderRadius: 'var(--radius-lg)' }}
                        priority
                    />
                </div>
                <div className="about-minimal__text">
                    <p className="about-minimal__story">
                        Here&apos;s Henry. When we adopted him from <a href="https://www.austinpetsalive.org" target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, textDecoration: 'none', color: 'var(--color-gold)' }}>Austin Pets Alive!</a>, they approximated his age to be 7 years old. It was a believable age. An <a href="https://embarkvet.com" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>Embark</a> test revealed he was closer to 10 years old and his heartworm was more progressed than we knew, in part due to a genetic condition that had been previously unknown. We adopted him thinking we had at most 3 years with him. In the end, we only had 10 months together. It made us realize how close he had been to passing without a loving home.
                    </p>
                </div>

                {/* Row 2: text left, image right */}
                <div className="about-minimal__text about-minimal__text--row2">
                    <p className="about-minimal__story">
                        Seniors are special. Even as they approach the rainbow bridge, they deserve a respectful passing, with an indulgent feast, whispers of praise, and gentle pets from those they love. Golden Years Club is dedicated to giving at-risk senior dogs and cats a final chance at living out their best golden years, with a family of their own to wait for at the rainbow bridge 🌈.
                    </p>
                    <p className="about-minimal__story" style={{ marginTop: 'var(--space-lg)' }}>
                        Golden Years Club is more than a website. It uses a novel computer vision pipeline to assess the health and wellbeing of shelter animals from their listing photos. Each image is processed through a multi-stage model that estimates body condition score, coat quality, stress indicators, and overall health, surfacing insights that would otherwise require an in-person veterinary evaluation. Combined with data aggregated from shelters and rescue networks nationwide, the platform provides a comprehensive, continuously updated view of at-risk senior animals and the organizations working to save them.
                    </p>
                </div>
                <div className="about-minimal__image about-minimal__image--right">
                    <Image
                        src="/about-hero-2.jpg"
                        alt="Senior German Shepherd sitting outdoors in Joshua Tree"
                        width={520}
                        height={693}
                        style={{ objectFit: 'cover', borderRadius: 'var(--radius-lg)' }}
                    />
                </div>
            </div>
        </section>
    );
}
