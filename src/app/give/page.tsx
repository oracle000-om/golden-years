import type { Metadata } from 'next';
import { RoadmapPoll } from './roadmap-client';

export const metadata: Metadata = {
    title: 'Give — Golden Years Club',
    description: 'Support senior animals on shelter euthanasia lists.',
};

export default function GivePage() {
    return (
        <section className="give-page">
            <div className="container" style={{ textAlign: 'center' }}>
                <div className="listings-header">
                    <span className="page-badge">💛 Give</span>
                </div>
                <RoadmapPoll />
            </div>
        </section>
    );
}
