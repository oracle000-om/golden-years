import { prisma } from '@/lib/db';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

async function getReEntryCandidates(status: string) {
    return (prisma as any).reEntryCandidate.findMany({
        where: { status },
        orderBy: { similarity: 'desc' },
        take: 100,
        include: {
            animal: {
                select: {
                    id: true, name: true, breed: true, species: true, sex: true,
                    photoUrl: true, status: true, intakeDate: true, createdAt: true,
                    ageSegment: true, intakeReason: true,
                    shelter: { select: { id: true, name: true, state: true } },
                },
            },
            matchedAnimal: {
                select: {
                    id: true, name: true, breed: true, species: true, sex: true,
                    photoUrl: true, status: true, intakeDate: true, createdAt: true,
                    ageSegment: true, intakeReason: true,
                    shelter: { select: { id: true, name: true, state: true } },
                },
            },
        },
    });
}

async function getCounts() {
    const [pending, confirmed, rejected] = await Promise.all([
        (prisma as any).reEntryCandidate.count({ where: { status: 'PENDING_REVIEW' } }),
        (prisma as any).reEntryCandidate.count({ where: { status: 'CONFIRMED' } }),
        (prisma as any).reEntryCandidate.count({ where: { status: 'REJECTED' } }),
    ]);
    return { pending, confirmed, rejected };
}

function AnimalCard({ animal, label }: { animal: any; label: string }) {
    const intakeDate = animal.intakeDate
        ? new Date(animal.intakeDate).toLocaleDateString()
        : new Date(animal.createdAt).toLocaleDateString();

    return (
        <div className="reentry-comparison__animal">
            <span className="reentry-comparison__label">{label}</span>
            <div className="reentry-comparison__photo-wrap">
                {animal.photoUrl ? (
                    <img
                        src={`/api/image-proxy?url=${encodeURIComponent(animal.photoUrl)}`}
                        alt={animal.name || 'Unknown'}
                        className="reentry-comparison__photo"
                    />
                ) : (
                    <div className="reentry-comparison__no-photo">No Photo</div>
                )}
            </div>
            <div className="reentry-comparison__details">
                <h3 className="reentry-comparison__name">
                    <Link href={`/animal/${animal.id}`}>{animal.name || 'Unknown'}</Link>
                </h3>
                <div className="reentry-comparison__meta">
                    <span>{animal.breed || 'Unknown breed'}</span>
                    <span>{animal.sex || ''}</span>
                    <span>{animal.ageSegment || ''}</span>
                </div>
                <div className="reentry-comparison__meta">
                    <span>📍 {animal.shelter.name} ({animal.shelter.state})</span>
                </div>
                <div className="reentry-comparison__meta">
                    <span>📅 Intake: {intakeDate}</span>
                    <span className={`reentry-status-badge reentry-status-badge--${animal.status?.toLowerCase()}`}>
                        {animal.status}
                    </span>
                </div>
                {animal.intakeReason && animal.intakeReason !== 'UNKNOWN' && (
                    <div className="reentry-comparison__meta">
                        <span>Reason: {animal.intakeReason}</span>
                    </div>
                )}
            </div>
        </div>
    );
}

function CandidateCard({ candidate }: { candidate: any }) {
    const similarity = (candidate.similarity * 100).toFixed(1);
    const sameShelter = candidate.animal.shelter.id === candidate.matchedAnimal.shelter.id;

    return (
        <div className="reentry-candidate">
            <div className="reentry-candidate__header">
                <div className="reentry-candidate__similarity">
                    <span className="reentry-candidate__score">{similarity}%</span>
                    <span className="reentry-candidate__match-label">match</span>
                </div>
                {sameShelter && (
                    <span className="reentry-candidate__same-shelter">Same Shelter</span>
                )}
            </div>

            <div className="reentry-comparison">
                <AnimalCard animal={candidate.animal} label="New Intake" />
                <div className="reentry-comparison__vs">↔</div>
                <AnimalCard animal={candidate.matchedAnimal} label="Historical" />
            </div>

            {candidate.status === 'PENDING_REVIEW' && (
                <div className="reentry-candidate__actions">
                    <form action={`/api/admin/re-entries`} method="POST">
                        <input type="hidden" name="id" value={candidate.id} />
                        <button
                            className="reentry-btn reentry-btn--confirm"
                            formAction={`/api/admin/re-entries`}
                            data-action="CONFIRM"
                            data-id={candidate.id}
                            type="button"
                        >
                            ✅ Confirm Match
                        </button>
                        <button
                            className="reentry-btn reentry-btn--reject"
                            data-action="REJECT"
                            data-id={candidate.id}
                            type="button"
                        >
                            ❌ Reject
                        </button>
                    </form>
                </div>
            )}

            {candidate.status === 'CONFIRMED' && (
                <div className="reentry-candidate__resolved">
                    ✅ Confirmed — Identity linked
                    {candidate.reviewedAt && <span> · {new Date(candidate.reviewedAt).toLocaleDateString()}</span>}
                </div>
            )}

            {candidate.status === 'REJECTED' && (
                <div className="reentry-candidate__resolved reentry-candidate__resolved--rejected">
                    ❌ Rejected
                    {candidate.reviewedAt && <span> · {new Date(candidate.reviewedAt).toLocaleDateString()}</span>}
                </div>
            )}
        </div>
    );
}

export default async function ReEntryReviewPage({
    searchParams,
}: {
    searchParams: Promise<{ status?: string }>;
}) {
    const params = await searchParams;
    const activeTab = params.status || 'PENDING_REVIEW';
    const [candidates, counts] = await Promise.all([
        getReEntryCandidates(activeTab),
        getCounts(),
    ]);

    return (
        <div className="admin-page">
            <h1 className="admin-page__title">🔄 Re-Entry Review</h1>
            <p className="admin-page__subtitle">
                Compare animals flagged as potential re-entries. Side-by-side photos help confirm matches.
            </p>

            {/* Tabs */}
            <div className="reentry-tabs">
                <Link
                    href="/admin/re-entries?status=PENDING_REVIEW"
                    className={`reentry-tab ${activeTab === 'PENDING_REVIEW' ? 'reentry-tab--active' : ''}`}
                >
                    Pending ({counts.pending})
                </Link>
                <Link
                    href="/admin/re-entries?status=CONFIRMED"
                    className={`reentry-tab ${activeTab === 'CONFIRMED' ? 'reentry-tab--active' : ''}`}
                >
                    Confirmed ({counts.confirmed})
                </Link>
                <Link
                    href="/admin/re-entries?status=REJECTED"
                    className={`reentry-tab ${activeTab === 'REJECTED' ? 'reentry-tab--active' : ''}`}
                >
                    Rejected ({counts.rejected})
                </Link>
            </div>

            {/* Candidate List */}
            {candidates.length === 0 ? (
                <div className="reentry-empty">
                    {activeTab === 'PENDING_REVIEW'
                        ? '🎉 No pending reviews — all caught up!'
                        : `No ${activeTab.toLowerCase().replace('_', ' ')} candidates.`}
                </div>
            ) : (
                <div className="reentry-list">
                    {candidates.map((c: any) => (
                        <CandidateCard key={c.id} candidate={c} />
                    ))}
                </div>
            )}

            {/* Client-side confirm/reject handler */}
            <script
                dangerouslySetInnerHTML={{
                    __html: `
                        document.querySelectorAll('[data-action]').forEach(btn => {
                            btn.addEventListener('click', async () => {
                                const action = btn.dataset.action;
                                const id = btn.dataset.id;
                                btn.disabled = true;
                                btn.textContent = action === 'CONFIRM' ? 'Confirming...' : 'Rejecting...';
                                try {
                                    const res = await fetch('/api/admin/re-entries', {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ id, action }),
                                    });
                                    if (res.ok) {
                                        location.reload();
                                    } else {
                                        const err = await res.json();
                                        alert('Error: ' + (err.error || 'Unknown'));
                                        btn.disabled = false;
                                        btn.textContent = action === 'CONFIRM' ? '✅ Confirm Match' : '❌ Reject';
                                    }
                                } catch (e) {
                                    alert('Network error');
                                    btn.disabled = false;
                                }
                            });
                        });
                    `,
                }}
            />
        </div>
    );
}
