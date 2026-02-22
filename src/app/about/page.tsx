import type { Metadata } from 'next';
import Image from 'next/image';

export const metadata: Metadata = {
    title: 'About | Golden Years Club',
    description: 'Surfacing senior animals on shelter euthanasia lists — giving them visibility, dignity, and a last chance.',
};

export default function AboutPage() {
    return (
        <section className="about-minimal">
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
                        More than half a million animals are euthanized at shelters every year in the United States. That averages out to roughly 1,600 dogs and cats per day. Without collective action and a systemic shift in how we treat animals in this country, that number is unlikely to go down.
                    </p>
                </div>

                {/* Row 2: text left, image right */}
                <div className="about-minimal__text about-minimal__text--row2">
                    <p className="about-minimal__story">
                        When we adopted Henry, the shelter thought he was 7. He was closer to 10, and his heartworm was more progressed than we knew. We had 10 months with him. It made me realize how close he was to passing without a loving home.
                    </p>
                    <p className="about-minimal__story">
                        Seniors are special. Golden Years Club is dedicated to giving seniors in shelters a final chance at living out their golden years.
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
