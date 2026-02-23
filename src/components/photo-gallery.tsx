'use client';

import { useState } from 'react';
import Image from 'next/image';

interface PhotoGalleryProps {
    photos: string[];
    name: string;
}

export function PhotoGallery({ photos, name }: PhotoGalleryProps) {
    const [activeIndex, setActiveIndex] = useState(0);

    if (photos.length <= 1) return null; // Only render when there are multiple photos

    return (
        <div className="photo-gallery">
            <div className="photo-gallery__main">
                <Image
                    src={photos[activeIndex]}
                    alt={`${name} — photo ${activeIndex + 1}`}
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    style={{ objectFit: 'cover' }}
                    priority={activeIndex === 0}
                />
                {photos.length > 1 && (
                    <>
                        <button
                            className="photo-gallery__arrow photo-gallery__arrow--prev"
                            onClick={(e) => { e.preventDefault(); setActiveIndex(i => (i - 1 + photos.length) % photos.length); }}
                            aria-label="Previous photo"
                        >
                            ‹
                        </button>
                        <button
                            className="photo-gallery__arrow photo-gallery__arrow--next"
                            onClick={(e) => { e.preventDefault(); setActiveIndex(i => (i + 1) % photos.length); }}
                            aria-label="Next photo"
                        >
                            ›
                        </button>
                        <span className="photo-gallery__counter">
                            {activeIndex + 1} / {photos.length}
                        </span>
                    </>
                )}
            </div>
            <div className="photo-gallery__thumbs">
                {photos.map((url, i) => (
                    <button
                        key={i}
                        className={`photo-gallery__thumb ${i === activeIndex ? 'photo-gallery__thumb--active' : ''}`}
                        onClick={(e) => { e.preventDefault(); setActiveIndex(i); }}
                        aria-label={`View photo ${i + 1}`}
                    >
                        <Image
                            src={url}
                            alt={`${name} — thumbnail ${i + 1}`}
                            fill
                            sizes="80px"
                            style={{ objectFit: 'cover' }}
                        />
                    </button>
                ))}
            </div>
        </div>
    );
}
