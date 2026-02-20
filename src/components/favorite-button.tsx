'use client';

import { useState, useEffect, useCallback } from 'react';

interface FavoriteButtonProps {
    animalId: string;
    animalName: string;
}

const STORAGE_KEY = 'golden-years-favorites';

function getFavorites(): string[] {
    if (typeof window === 'undefined') return [];
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

function setFavorites(ids: string[]) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch {
        // localStorage full or unavailable
    }
}

export function FavoriteButton({ animalId, animalName }: FavoriteButtonProps) {
    const [isFavorited, setIsFavorited] = useState(false);
    const [animating, setAnimating] = useState(false);

    useEffect(() => {
        setIsFavorited(getFavorites().includes(animalId));
    }, [animalId]);

    const toggleFavorite = useCallback(() => {
        const favorites = getFavorites();
        let updated: string[];

        if (favorites.includes(animalId)) {
            updated = favorites.filter((id) => id !== animalId);
            setIsFavorited(false);
        } else {
            updated = [...favorites, animalId];
            setIsFavorited(true);
            setAnimating(true);
            setTimeout(() => setAnimating(false), 600);
        }

        setFavorites(updated);

        // Dispatch custom event so other components can react
        window.dispatchEvent(new CustomEvent('favorites-changed', { detail: updated }));
    }, [animalId]);

    return (
        <button
            onClick={toggleFavorite}
            className={`favorite-btn ${isFavorited ? 'favorite-btn--active' : ''} ${animating ? 'favorite-btn--animating' : ''}`}
            aria-label={isFavorited ? `Remove ${animalName} from favorites` : `Add ${animalName} to favorites`}
            title={isFavorited ? 'Remove from watchlist' : 'Add to watchlist'}
        >
            <span className="favorite-btn__icon">{isFavorited ? '♥' : '♡'}</span>
            <span className="favorite-btn__text">{isFavorited ? 'Saved' : 'Watch'}</span>
        </button>
    );
}
