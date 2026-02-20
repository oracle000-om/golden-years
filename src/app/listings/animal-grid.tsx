'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { formatScheduledDate, formatIntakeDate, hoursUntil, getUrgencyLevel, formatLifeCutShort } from '@/lib/utils';
import type { AnimalWithShelter } from '@/lib/types';

const PAGE_SIZE = 12;

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
                    const lifeCutShort = formatLifeCutShort(
                        animal.ageKnownYears,
                        animal.ageEstimatedLow,
                        animal.ageEstimatedHigh,
                        animal.ageSource,
                        animal.lifeExpectancyLow,
                        animal.lifeExpectancyHigh,
                        animal.euthScheduledAt,
                    );

                    const shelterAge = animal.ageKnownYears !== null
                        ? `${animal.ageKnownYears} yr${animal.ageKnownYears !== 1 ? 's' : ''}`
                        : '—';

                    const gyAge = (animal.ageEstimatedLow !== null && animal.ageEstimatedHigh !== null)
                        ? `~${animal.ageEstimatedLow}–${animal.ageEstimatedHigh} yrs`
                        : 'Pending';

                    const breedLifespan = (animal.lifeExpectancyLow && animal.lifeExpectancyHigh)
                        ? `${animal.lifeExpectancyLow}–${animal.lifeExpectancyHigh} yrs`
                        : '—';

                    const intakeDisplay = formatIntakeDate(animal.intakeDate);

                    return (
                        <Link
                            key={animal.id}
                            href={`/animal/${animal.id}`}
                            className="animal-card"
                        >
                            <div className="animal-card__image">
                                {animal.photoUrl ? (
                                    <Image src={animal.photoUrl} alt={animal.name || 'Unnamed animal'} fill sizes="(max-width: 768px) 100vw, 33vw" style={{ objectFit: 'cover' }} />
                                ) : (
                                    <Image src="/no-photo.svg" alt="Photo not available" fill sizes="(max-width: 768px) 100vw, 33vw" style={{ objectFit: 'cover' }} />
                                )}
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

                                <div className="animal-card__details">
                                    <div className="animal-card__detail">
                                        <span className="animal-card__detail-label">Shelter estimate</span>
                                        <span className="animal-card__detail-value">{shelterAge}</span>
                                    </div>
                                    <div className="animal-card__detail">
                                        <span className="animal-card__detail-label animal-card__detail-label--gy">Golden Years estimate</span>
                                        <span className={`animal-card__detail-value ${gyAge !== 'Pending' ? 'cv-estimated' : ''}`}>{gyAge}</span>
                                    </div>
                                    <div className="animal-card__detail">
                                        <span className="animal-card__detail-label">Breed lifespan</span>
                                        <span className="animal-card__detail-value">{breedLifespan}</span>
                                    </div>
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
                                    <span className="animal-card__death-marker-label">Scheduled</span>
                                    <span className="animal-card__death-marker-time">
                                        {formatScheduledDate(animal.euthScheduledAt)}
                                    </span>
                                    {lifeCutShort && (
                                        <div className="animal-card__life-cut-short">
                                            Potential years of life lost: {lifeCutShort}
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
