import Link from 'next/link';
import type { Metadata } from 'next';
import { getFilteredAnimals, getDistinctStates } from '@/lib/queries';
import { FilterBar } from './listings/filter-bar';
import { SearchBar } from './listings/search-bar';
import { AnimalGrid } from './listings/animal-grid';
import type { AnimalWithShelter } from '@/lib/types';

export const revalidate = 60; // ISR: revalidate every 60 seconds

export const metadata: Metadata = {
  title: 'Golden Years Club',
  description: 'Surfacing senior animals on shelter euthanasia lists — giving them visibility, dignity, and a last chance.',
  openGraph: {
    title: 'Golden Years Club',
    description: 'Surfacing senior animals on shelter euthanasia lists — giving them visibility, dignity, and a last chance.',
    type: 'website',
    siteName: 'Golden Years Club',
  },
  twitter: {
    card: 'summary',
    title: 'Golden Years Club',
    description: 'Browse senior animals currently on shelter euthanasia lists.',
  },
};

interface SearchParams {
  species?: string;
  time?: string;
  state?: string;
  sex?: string;
  q?: string;
  zip?: string;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  let animals: AnimalWithShelter[] = [];
  let states: string[] = [];
  let error = false;

  try {
    [animals, states] = await Promise.all([
      getFilteredAnimals(params),
      getDistinctStates(),
    ]);
  } catch (e) {
    console.error('Failed to load listings:', e);
    error = true;
  }

  if (error) {
    return (
      <div className="listings-page">
        <div className="container">
          <div className="error-state">
            <div className="error-state__icon">⚠️</div>
            <h2 className="error-state__title">Unable to load listings</h2>
            <p className="error-state__text">
              We&apos;re having trouble connecting to our database right now.
              Please try again in a few moments.
            </p>
            <Link href="/" className="error-state__retry">
              Try Again →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="listings-page">
      <div className="container">
        <div className="listings-header">
          <span className="page-badge">📡 Live List ({animals.length})</span>
        </div>

        <p className="listings-header__description">
          Dedicated to delivering seniors to warm, loving forever homes.
        </p>

        <SearchBar />

        <FilterBar
          currentSpecies={params.species || 'all'}
          currentState={params.state || 'all'}
          currentSex={params.sex || 'all'}
          currentZip={params.zip || ''}
          states={states}
        />

        {animals.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon">🔍</div>
            <p className="empty-state__text">
              No animals match your current filters. Try adjusting your search criteria.
            </p>
          </div>
        ) : (
          <AnimalGrid animals={animals} />
        )}
      </div>
    </div>
  );
}
