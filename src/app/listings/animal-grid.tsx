'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { formatScheduledDate, formatIntakeDate, hoursUntil, getUrgencyLevel, getGoldenYearsConfidence, getSaveRate } from '@/lib/utils';
import type { AnimalWithShelter } from '@/lib/types';

const PAGE_SIZE = 24;

type ShowMode = 'paged' | 'all';

export function AnimalGrid({ animals }: { animals: AnimalWithShelter[] }) {
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const [showMode, setShowMode] = useState<ShowMode>('paged');
    const sentinelRef = useRef<HTMLDivElement>(null);

    // Reset pagination when animals change (filter/search change)
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        setVisibleCount(PAGE_SIZE);
        setShowMode('paged');
    }, [animals]);
    /* eslint-enable react-hooks/set-state-in-effect */

    const total = animals.length;
    const displayed = showMode === 'all' ? visibleCount : Math.min(visibleCount, total);
    const hasMore = displayed < total;

    // Infinite scroll for "show all" mode
    const loadMore = useCallback(() => {
        if (showMode === 'all') {
            setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, total));
        }
    }, [showMode, total]);

    useEffect(() => {
        if (showMode !== 'all') return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    loadMore();
                }
            },
            { rootMargin: '400px' }
        );

        const el = sentinelRef.current;
        if (el) observer.observe(el);
        return () => { if (el) observer.unobserve(el); };
    }, [showMode, loadMore]);

    function handleShowMore() {
        setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, total));
    }

    function handleShowAll() {
        setShowMode('all');
    }

    const visible = animals.slice(0, displayed);

    return (
        <>
            <div className="listings-count">
                Showing {visible.length} of {total} animal{total !== 1 ? 's' : ''}
                {showMode === 'paged' && hasMore && (
                    <>
                        <span className="listings-count__sep">·</span>
                        <button className="listings-count__btn" onClick={handleShowMore}>
                            Show More
                        </button>
                        <span className="listings-count__sep">·</span>
                        <button className="listings-count__btn" onClick={handleShowAll}>
                            Show All
                        </button>
                    </>
                )}
                {showMode === 'all' && visibleCount < total && (
                    <span className="listings-count__loading"> Loading…</span>
                )}
            </div>

            <div className="card-grid">
                {visible.map((animal) => {
                    const hours = hoursUntil(animal.euthScheduledAt);
                    const urgency = getUrgencyLevel(hours);

                    // Shelter public data
                    const saveRate = getSaveRate(
                        animal.shelter?.totalIntakeAnnual ?? 0,
                        animal.shelter?.totalEuthanizedAnnual ?? 0,
                    );

                    const shelterAge = animal.ageKnownYears !== null
                        ? `${animal.ageKnownYears} yr${animal.ageKnownYears !== 1 ? 's' : ''}`
                        : '—';

                    const gyAge = (animal.ageEstimatedLow !== null && animal.ageEstimatedHigh !== null)
                        ? `${animal.ageEstimatedLow}–${animal.ageEstimatedHigh} yrs`
                        : 'Pending';

                    const confidence = getGoldenYearsConfidence(
                        animal.ageSource,
                        animal.ageConfidence,
                        animal.ageKnownYears,
                        animal.ageEstimatedLow,
                        animal.ageEstimatedHigh,
                        animal.lifeExpectancyLow,
                        animal.lifeExpectancyHigh,
                    );

                    const breedLifespan = (animal.lifeExpectancyLow && animal.lifeExpectancyHigh)
                        ? `${animal.lifeExpectancyLow}–${animal.lifeExpectancyHigh} yrs`
                        : '—';

                    // Golden Years remaining: age range vs life expectancy
                    let goldenYearsRemaining: string | null = null;
                    if (animal.lifeExpectancyLow !== null && animal.lifeExpectancyHigh !== null) {
                        const age = animal.ageEstimatedLow !== null && animal.ageEstimatedHigh !== null
                            ? (animal.ageEstimatedLow + animal.ageEstimatedHigh) / 2
                            : animal.ageKnownYears;
                        if (age !== null) {
                            const low = Math.max(0, Math.round(animal.lifeExpectancyLow - age));
                            const high = Math.max(0, Math.round(animal.lifeExpectancyHigh - age));
                            if (high > 0) {
                                goldenYearsRemaining = low === high
                                    ? `Up to ${high} yr${high !== 1 ? 's' : ''}`
                                    : `Up to ${low}–${high} yrs`;
                            }
                        }
                    }

                    // Days in shelter
                    let daysInShelter: number | null = null;
                    if (animal.intakeDate) {
                        const intake = new Date(animal.intakeDate);
                        const now = new Date();
                        daysInShelter = Math.max(0, Math.floor((now.getTime() - intake.getTime()) / (1000 * 60 * 60 * 24)));
                    }

                    const intakeDisplay = formatIntakeDate(animal.intakeDate);

                    return (
                        <Link
                            key={animal.id}
                            href={`/animal/${animal.id}`}
                            className="animal-card"
                        >
                            <div className="animal-card__image">
                                {animal.photoUrl ? (
                                    <Image src={animal.photoUrl} alt={animal.name || 'Unnamed animal'} fill sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 640px" style={{ objectFit: 'cover' }} />
                                ) : (
                                    <Image src="/no-photo.svg" alt="Photo not available" fill sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 640px" style={{ objectFit: 'cover' }} />
                                )}
                                {/* Only show urgency badge when real euthanasia schedule exists */}
                                {urgency !== 'standard' && (
                                    <span className={`animal-card__urgency-badge ${urgency}`}>
                                        {urgency === 'critical' ? '< 24h' : urgency === 'urgent' ? '< 48h' : '< 72h'}
                                    </span>
                                )}
                            </div>

                            <div className="animal-card__body">
                                <h2 className={`animal-card__name ${!animal.name ? 'unnamed' : ''}`}>
                                    {animal.name || 'Unnamed'}
                                </h2>
                                <p className="animal-card__sex">
                                    {animal.sex ? animal.sex.charAt(0) + animal.sex.slice(1).toLowerCase() : ''}
                                </p>
                                <p className="animal-card__shelter">
                                    {animal.shelter.name}
                                </p>
                                {(animal.shelter.county || animal.shelter.state || animal.shelter.phone) && (
                                    <p className="animal-card__shelter-location">
                                        {[animal.shelter.county, animal.shelter.state].filter(Boolean).join(', ')}
                                        {animal.shelter.phone && <span className="animal-card__shelter-phone"> · {animal.shelter.phone}</span>}
                                    </p>
                                )}

                                <div className="animal-card__details">
                                    <div className="animal-card__detail">
                                        <span className="animal-card__detail-label">Shelter estimate</span>
                                        <span className="animal-card__detail-value">{shelterAge}</span>
                                    </div>
                                    <div className="animal-card__detail">
                                        <span className="animal-card__detail-label animal-card__detail-label--gy">Golden Years estimate</span>
                                        <span className="gy-tooltip">
                                            <span className={`animal-card__detail-value ${gyAge !== 'Pending' ? 'cv-estimated' : ''}`}>{gyAge}</span>
                                            <span className="gy-tooltip__popup">
                                                <span className="gy-tooltip__label">Confidence</span>
                                                <span className="gy-tooltip__pct">{confidence.label} · {confidence.percent}%</span>
                                            </span>
                                        </span>
                                    </div>
                                    <div className="animal-card__detail">
                                        <span className="animal-card__detail-label">Breed life expectancy</span>
                                        <span className="gy-tooltip">
                                            <span className="animal-card__detail-value">{breedLifespan}</span>
                                            <span className="gy-tooltip__popup">
                                                <span className="gy-tooltip__label">Disclaimer</span>
                                                <span className="gy-tooltip__pct">Life expectancy value is based on AI approximations of breed mix</span>
                                            </span>
                                        </span>
                                    </div>
                                    {goldenYearsRemaining && (
                                        <div className="animal-card__golden-remaining">
                                            <span className="animal-card__golden-remaining-label">Golden Years remaining</span>
                                            <span className="animal-card__golden-remaining-value">{goldenYearsRemaining}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="animal-card__footer">
                                <div className="animal-card__death-marker">
                                    {intakeDisplay && (
                                        <>
                                            <span className="animal-card__death-marker-label">Intake</span>
                                            <span className="animal-card__death-marker-time standard">
                                                {intakeDisplay}
                                            </span>
                                        </>
                                    )}
                                    {animal.euthScheduledAt ? (
                                        <>
                                            <span className="animal-card__death-marker-label">Scheduled</span>
                                            <span className={`animal-card__death-marker-time ${urgency}`}>
                                                {formatScheduledDate(animal.euthScheduledAt)}
                                            </span>
                                        </>
                                    ) : saveRate !== null ? (
                                        <div className="animal-card__shelter-stats">
                                            <div className="animal-card__shelter-stats-header">
                                                <span className="animal-card__shelter-stats-label">Live release rate</span>
                                                <span className={`animal-card__shelter-stats-pct ${saveRate >= 90 ? 'high' : saveRate >= 50 ? 'mid' : 'low'}`}>
                                                    {saveRate}%
                                                </span>
                                            </div>
                                            <div className="animal-card__shelter-stats-bar">
                                                <div
                                                    className={`animal-card__shelter-stats-fill ${saveRate >= 90 ? 'high' : saveRate >= 50 ? 'mid' : 'low'}`}
                                                    style={{ width: `${Math.min(saveRate, 100)}%` }}
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <span className="animal-card__death-marker-label">Status</span>
                                            <span className="animal-card__death-marker-time standard">In Shelter</span>
                                        </>
                                    )}
                                    {daysInShelter !== null && (
                                        <div className="animal-card__days-in-shelter">
                                            {daysInShelter === 0 ? 'Arrived today' : `${daysInShelter} day${daysInShelter !== 1 ? 's' : ''} in shelter`}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </Link>
                    );
                })}
            </div>

            {showMode === 'paged' && hasMore && (
                <div className="listings-show-more">
                    <button className="listings-show-more__btn" onClick={handleShowMore}>
                        Show More ({Math.min(PAGE_SIZE, total - displayed)} more)
                    </button>
                </div>
            )}

            {/* Sentinel for infinite scroll in "show all" mode */}
            {showMode === 'all' && visibleCount < total && (
                <div ref={sentinelRef} className="listings-sentinel" />
            )}
        </>
    );
}
