import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'About | Golden Years Club',
    description: 'Surfacing senior animals on shelter euthanasia lists — giving them visibility, dignity, and a last chance.',
};

export default function AboutPage() {
    return (
        <section className="about-minimal">
            <div className="container about-minimal__content">
                <div className="about-minimal__image">
                    <Image
                        src="/no-photo.svg"
                        alt="Golden Years Club"
                        width={320}
                        height={320}
                        style={{ objectFit: 'cover', borderRadius: 'var(--radius-lg)', opacity: 0.7 }}
                    />
                </div>
                <div className="about-minimal__text">
                    <p className="about-minimal__story">
                        Every year, thousands of senior animals are placed on shelter euthanasia lists — not because they&apos;re sick or dangerous, but because they&apos;re old. They&apos;ve already lived full lives. They&apos;ve already loved someone. And now, in a concrete kennel, they wait for a second chance that rarely comes.
                    </p>
                    <p className="about-minimal__story">
                        Golden Years Club exists to surface these animals. To make them visible. To give every gray muzzle and clouded eye one more shot at a warm bed and a gentle hand.
                    </p>
                    <p className="about-minimal__links">
                        <Link href="https://www.reddit.com/r/SeniorDogs/" target="_blank" rel="noopener noreferrer">
                            r/SeniorDogs ↗
                        </Link>
                    </p>
                </div>
            </div>
        </section>
    );
}
