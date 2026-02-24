'use client';

import { useRouter } from 'next/navigation';

/**
 * Client-side back button that uses browser history (router.back())
 * so filters and scroll position are preserved when returning to the list.
 * Falls back to "/" if there's no history (e.g. direct link to animal page).
 */
export function BackButton() {
    const router = useRouter();

    return (
        <button
            type="button"
            className="animal-detail__back"
            onClick={() => {
                if (window.history.length > 1) {
                    router.back();
                } else {
                    router.push('/');
                }
            }}
        >
            ← Back to the list
        </button>
    );
}
