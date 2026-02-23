'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useTransition } from 'react';

interface PaginationProps {
    page: number;
    totalPages: number;
}

export function Pagination({ page, totalPages }: PaginationProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    const goToPage = useCallback(
        (p: number) => {
            const params = new URLSearchParams(searchParams.toString());
            if (p <= 1) {
                params.delete('page');
            } else {
                params.set('page', String(p));
            }
            startTransition(() => {
                router.push(`/?${params.toString()}`);
            });
            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        [router, searchParams, startTransition],
    );

    // Generate page numbers to show
    const pages: (number | '...')[] = [];
    if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
        pages.push(1);
        if (page > 3) pages.push('...');
        for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
            pages.push(i);
        }
        if (page < totalPages - 2) pages.push('...');
        pages.push(totalPages);
    }

    return (
        <nav className="pagination" aria-label="Page navigation">
            <button
                className="pagination__btn"
                disabled={page <= 1 || isPending}
                onClick={() => goToPage(page - 1)}
            >
                ← Prev
            </button>

            {pages.map((p, idx) =>
                p === '...' ? (
                    <span key={`ellipsis-${idx}`} className="pagination__ellipsis">…</span>
                ) : (
                    <button
                        key={p}
                        className={`pagination__btn ${p === page ? 'pagination__btn--active' : ''}`}
                        disabled={isPending}
                        onClick={() => goToPage(p)}
                    >
                        {p}
                    </button>
                )
            )}

            <button
                className="pagination__btn"
                disabled={page >= totalPages || isPending}
                onClick={() => goToPage(page + 1)}
            >
                Next →
            </button>
        </nav>
    );
}
