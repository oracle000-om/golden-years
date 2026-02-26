'use client';

import { useState } from 'react';
import { AnimalGrid } from '@/app/listings/animal-grid';
import type { AnimalResult } from '@/lib/queries';

interface ShelterAnimalsProps {
    animals: AnimalResult[];
}

type SpeciesFilter = 'ALL' | 'DOG' | 'CAT' | 'OTHER';

export function ShelterAnimals({ animals }: ShelterAnimalsProps) {
    const [filter, setFilter] = useState<SpeciesFilter>('ALL');

    const dogCount = animals.filter((a) => a.species === 'DOG').length;
    const catCount = animals.filter((a) => a.species === 'CAT').length;
    const otherCount = animals.filter((a) => a.species === 'OTHER').length;

    const filtered = filter === 'ALL' ? animals : animals.filter((a) => a.species === filter);

    const chipClass = (species: SpeciesFilter) =>
        `shelter-animals__count-chip${filter === species ? ' shelter-animals__count-chip--active' : ''}`;

    return (
        <div className="shelter-animals">
            <div className="shelter-animals__header">
                <h2 className="shelter-animals__title">Seniors at This Shelter</h2>
                <div className="shelter-animals__counts">
                    {dogCount > 0 && (
                        <button
                            className={chipClass('DOG')}
                            onClick={() => setFilter(filter === 'DOG' ? 'ALL' : 'DOG')}
                        >
                            🐕 {dogCount} {dogCount === 1 ? 'Dog' : 'Dogs'}
                        </button>
                    )}
                    {catCount > 0 && (
                        <button
                            className={chipClass('CAT')}
                            onClick={() => setFilter(filter === 'CAT' ? 'ALL' : 'CAT')}
                        >
                            🐈 {catCount} {catCount === 1 ? 'Cat' : 'Cats'}
                        </button>
                    )}
                    {otherCount > 0 && (
                        <button
                            className={chipClass('OTHER')}
                            onClick={() => setFilter(filter === 'OTHER' ? 'ALL' : 'OTHER')}
                        >
                            🐾 {otherCount} Other
                        </button>
                    )}
                </div>
            </div>

            {filtered.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state__icon">✨</div>
                    <p className="empty-state__text">
                        No animals currently listed at this shelter.
                    </p>
                </div>
            ) : (
                <AnimalGrid
                    animals={filtered}
                    totalCount={filtered.length}
                    page={1}
                    totalPages={1}
                />
            )}
        </div>
    );
}
