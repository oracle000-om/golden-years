'use client';

import { useState } from 'react';
import { SafeImage } from '@/components/SafeImage';

interface PhotoGalleryProps {
    photos: string[];
    name: string;
    videoUrl?: string | null;
}

export function PhotoGallery({ photos, name, videoUrl }: PhotoGalleryProps) {
    // Video is slide 0 if present, photos follow
    const hasVideo = !!videoUrl;
    const totalSlides = photos.length + (hasVideo ? 1 : 0);
    const [activeIndex, setActiveIndex] = useState(0);

    if (totalSlides <= 1 && !hasVideo) return null;

    const isVideoSlide = hasVideo && activeIndex === 0;
    const photoIndex = hasVideo ? activeIndex - 1 : activeIndex;

    return (
        <div className="photo-gallery">
            <div className="photo-gallery__main">
                {isVideoSlide ? (
                    <video
                        className="photo-gallery__video"
                        src={videoUrl!}
                        controls
                        muted
                        playsInline
                        poster={photos[0]}
                    />
                ) : (
                    <SafeImage
                        src={photos[photoIndex]}
                        alt={`${name} — photo ${photoIndex + 1}`}
                        fill
                        sizes="(max-width: 768px) 100vw, 50vw"
                        style={{ objectFit: 'contain' }}
                        priority={activeIndex === 0}
                    />
                )}
                {totalSlides > 1 && (
                    <>
                        <button
                            className="photo-gallery__arrow photo-gallery__arrow--prev"
                            onClick={(e) => { e.preventDefault(); setActiveIndex(i => (i - 1 + totalSlides) % totalSlides); }}
                            aria-label="Previous"
                        >
                            ‹
                        </button>
                        <button
                            className="photo-gallery__arrow photo-gallery__arrow--next"
                            onClick={(e) => { e.preventDefault(); setActiveIndex(i => (i + 1) % totalSlides); }}
                            aria-label="Next"
                        >
                            ›
                        </button>
                        <span className="photo-gallery__counter">
                            {activeIndex + 1} / {totalSlides}
                        </span>
                    </>
                )}
            </div>
            <div className="photo-gallery__thumbs">
                {hasVideo && (
                    <button
                        className={`photo-gallery__thumb ${activeIndex === 0 ? 'photo-gallery__thumb--active' : ''}`}
                        onClick={(e) => { e.preventDefault(); setActiveIndex(0); }}
                        aria-label="View video"
                    >
                        <span className="photo-gallery__thumb-video">▶</span>
                    </button>
                )}
                {photos.map((url, i) => (
                    <button
                        key={i}
                        className={`photo-gallery__thumb ${(hasVideo ? i + 1 : i) === activeIndex ? 'photo-gallery__thumb--active' : ''}`}
                        onClick={(e) => { e.preventDefault(); setActiveIndex(hasVideo ? i + 1 : i); }}
                        aria-label={`View photo ${i + 1}`}
                    >
                        <SafeImage
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
