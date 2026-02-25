import type { Metadata } from 'next';
import { getNoKillShelters } from '@/lib/queries';
import { DidYouKnowCard } from './dyk-card';
import { BestOfBreedList } from './filter-list';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Best of Breed | Golden Years Club',
    description: 'Celebrating shelters that have achieved no-kill status — saving 90% or more of the animals in their care.',
};

export default async function WallOfFamePage() {
    const { shelters, noKillPercent } = await getNoKillShelters();

    return (
        <section className="wof">
            <div className="container">
                <header className="wof__header">
                    <span className="page-badge">🏆 Best of Breed</span>
                    <p className="wof__note">
                        Celebrating shelters leading the no-kill movement.
                    </p>
                </header>

                <DidYouKnowCard noKillPercent={noKillPercent} />

                {shelters.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state__icon">🏛️</div>
                        <p className="empty-state__text">
                            No shelters have achieved no-kill status in our dataset yet. As we expand coverage, this wall will grow.
                        </p>
                    </div>
                ) : (
                    <BestOfBreedList shelters={shelters} />
                )}
                <div className="wof__cta">
                    <p className="wof__cta-text">Don&apos;t see your shelter here?</p>
                    <a href="/join" className="wof__cta-btn">
                        Request to be added →
                    </a>
                </div>
            </div>
        </section>
    );
}
