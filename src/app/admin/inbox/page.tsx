import { getRecentFeedback, getRecentPollResponses } from '@/lib/admin-queries';

export const dynamic = 'force-dynamic';

function timeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

export default async function InboxPage() {
    const [feedback, pollResponses] = await Promise.all([
        getRecentFeedback(),
        getRecentPollResponses(),
    ]);

    return (
        <div className="admin-page">
            <h1 className="admin-page__title">Inbox</h1>

            {/* ── Feedback ── */}
            <div className="admin-card" style={{ marginBottom: 'var(--space-2xl)' }}>
                <h2 className="admin-card__title">
                    💬 Feedback ({feedback.length})
                </h2>
                {feedback.length === 0 ? (
                    <p style={{ color: 'var(--color-text-dim)', fontStyle: 'italic' }}>No feedback yet.</p>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Note</th>
                                    <th>When</th>
                                </tr>
                            </thead>
                            <tbody>
                                {feedback.map(f => (
                                    <tr key={f.id}>
                                        <td style={{ whiteSpace: 'nowrap' }}>{f.firstName}</td>
                                        <td style={{ whiteSpace: 'nowrap', color: f.email ? 'inherit' : 'var(--color-text-dim)' }}>
                                            {f.email || '—'}
                                        </td>
                                        <td style={{ maxWidth: 480, lineHeight: 1.5 }}>{f.note}</td>
                                        <td style={{ whiteSpace: 'nowrap', color: 'var(--color-text-dim)' }}>
                                            {timeAgo(f.createdAt)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ── Poll "Neither" Responses ── */}
            <div className="admin-card">
                <h2 className="admin-card__title">
                    🤔 Poll Responses ({pollResponses.length})
                </h2>
                {pollResponses.length === 0 ? (
                    <p style={{ color: 'var(--color-text-dim)', fontStyle: 'italic' }}>No open-text poll responses yet.</p>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>Poll</th>
                                    <th>Response</th>
                                    <th>When</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pollResponses.map(r => (
                                    <tr key={r.id}>
                                        <td style={{ whiteSpace: 'nowrap' }}>{r.pollTitle}</td>
                                        <td style={{ maxWidth: 520, lineHeight: 1.5 }}>{r.neitherText}</td>
                                        <td style={{ whiteSpace: 'nowrap', color: 'var(--color-text-dim)' }}>
                                            {timeAgo(r.createdAt)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
