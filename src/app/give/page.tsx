import type { Metadata } from 'next';
import { RoadmapPoll } from './roadmap-client';
import { FeedbackForm } from './feedback-form';

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
                <FeedbackForm />
                <a
                    href="https://ko-fi.com/itsmedaye"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="give-tip"
                >
                    <span className="give-tip__heart">♥</span> Tip the developer
                </a>
            </div>
        </section>
    );
}
