import type { Metadata } from 'next';
import { getActivePolls } from '@/lib/queries';
import { PollPageClient } from './poll-client';

export const revalidate = 60;

export const metadata: Metadata = {
    title: 'Public Square — Golden Years Club',
    description: 'Weigh in on animal welfare policy. Read the facts, cast your vote, and see how the community feels.',
};

export default async function PollPage() {
    let polls: Array<{
        id: string;
        slug: string;
        title: string;
        statement: string;
        forTitle: string;
        forArgument: string;
        againstTitle: string;
        againstArgument: string;
        neitherTitle: string;
        neitherPrompt: string;
    }> = [];
    let error = false;

    try {
        polls = await getActivePolls();
    } catch (e) {
        console.error('Failed to load polls:', e);
        error = true;
    }

    if (error) {
        return (
            <div className="poll-page">
                <div className="container">
                    <div className="error-state">
                        <div className="error-state__icon">⚠️</div>
                        <h2 className="error-state__title">Unable to load polls</h2>
                        <p className="error-state__text">
                            We&apos;re having trouble right now. Please try again in a moment.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    if (polls.length === 0) {
        return (
            <div className="poll-page">
                <div className="container">
                    <div className="empty-state">
                        <div className="empty-state__icon">🗳️</div>
                        <p className="empty-state__text">
                            No active polls right now. Check back soon.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="poll-page">
            <div className="container">
                <PollPageClient polls={polls} />
            </div>
        </div>
    );
}
