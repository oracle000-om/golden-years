import Link from 'next/link';
import type { Metadata } from 'next';
import { getFilteredAnimals, getDistinctStates, getSuggestions, hasEuthScheduledAnimals } from '@/lib/queries';
import { parseSearchQuery } from '@/lib/search-parser';
import { trackPageView } from '@/lib/track';
import { FilterBar } from './listings/filter-bar';
import { SearchBar } from './listings/search-bar';
import { AnimalGrid } from './listings/animal-grid';
import { Pagination } from './listings/pagination';
import type { SearchSuggestion, PaginatedResult } from '@/lib/queries';

export const revalidate = 60;

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
  sort?: string;
  page?: string;
  radius?: string;
  source?: string;
  status?: string;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  let result: PaginatedResult = { animals: [], totalCount: 0, page: 1, totalPages: 1, pageSize: 24 };
  let states: string[] = [];
  let suggestions: SearchSuggestion[] = [];
  let hasEuthDates = false;
  let error = false;

  try {
    // Run all three queries in parallel — they're independent.
    // getDistinctStates and hasEuthScheduledAnimals are cached in-memory
    // so they're near-instant on warm invocations.
    [result, states, hasEuthDates] = await Promise.all([
      getFilteredAnimals(params),
      getDistinctStates(),
      hasEuthScheduledAnimals(),
    ]);

    // Generate suggestions when search returns 0 results
    if (result.animals.length === 0 && params.q?.trim()) {
      const intent = parseSearchQuery(params.q);
      suggestions = await getSuggestions(intent);
    }
  } catch (e) {
    console.error('Failed to load listings:', e);
    error = true;
  }

  // Fire-and-forget analytics (never blocks render)
  if (!error) {
    trackPageView({
      path: '/',
      searchQuery: params.q || undefined,
      filters: {
        species: params.species,
        state: params.state,
        sex: params.sex,
        sort: params.sort,
        source: params.source,
        status: params.status,
      },
    });
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

  const { animals, totalCount, page, totalPages } = result;
  const hasLocation = !!(params.zip || params.q);

  return (
    <div className="listings-page">
      <div className="container">
        <div className="listings-header">
          <span className="page-badge">📡 LIST ({totalCount})</span>
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
          currentSort={params.sort || 'urgency'}
          currentRadius={params.radius || '100'}
          currentSource={params.source || 'all'}
          currentTime={params.time || 'all'}
          hasLocation={hasLocation}
          hasEuthDates={hasEuthDates}
          states={states}
        />

        {animals.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon">🔍</div>
            <p className="empty-state__text">
              No animals match your current filters. Try adjusting your search criteria.
            </p>
            {suggestions.length > 0 && (
              <div className="empty-state__suggestions">
                <p className="empty-state__suggestions-label">Did you mean:</p>
                {suggestions.map((s) => (
                  <Link
                    key={s.q}
                    href={`/?q=${encodeURIComponent(s.q)}`}
                    className="empty-state__suggestion"
                  >
                    &ldquo;{s.q}&rdquo; — {s.label} ({s.count} results)
                  </Link>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <AnimalGrid animals={animals} totalCount={totalCount} page={page} totalPages={totalPages} />
            {totalPages > 1 && (
              <Pagination page={page} totalPages={totalPages} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
