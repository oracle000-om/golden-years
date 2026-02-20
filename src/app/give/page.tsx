import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Give — Golden Years Club',
    description: 'Support senior animals on shelter euthanasia lists.',
};

export default function GivePage() {
    return (
        <section className="about-minimal">
            <div className="container" style={{ textAlign: 'center' }}>
                <div className="listings-header">
                    <span className="page-badge">💛 Give</span>
                </div>
                <p className="about-minimal__story">
                    Coming soon.
                </p>
            </div>
        </section>
    );
}
