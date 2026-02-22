'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const CAT_FACTS = [
    "Cats are classified as senior at age 11 and geriatric at 15 by the AAFP.",
    "Indoor cats live an average of 12–18 years, while outdoor cats average 2–5 years.",
    "Siamese and Burmese cats are among the longest-lived breeds, often reaching 18–20 years.",
    "Senior cats sleep 16–20 hours per day, compared to 12–16 for younger cats.",
    "Hyperthyroidism affects approximately 10% of cats over age 10.",
    "Chronic kidney disease is the leading cause of death in cats over 15.",
    "Senior cats lose muscle mass at a rate of about 1–2% per year after age 12.",
    "Cats over 7 years old make up roughly 50% of cats in U.S. shelters.",
    "Senior cats are 2x more likely to be euthanized in shelters than kittens.",
    "Persian cats are genetically predisposed to polycystic kidney disease, detectable via ultrasound.",
    "Wet food helps senior cats stay hydrated — cats get 70–80% of their water from food.",
    "Dental disease affects over 70% of cats by age 3, increasing significantly with age.",
    "A cat's personality is largely set by age 3 and remains stable through their senior years.",
];

const DOG_FACTS = [
    "Dogs are considered senior at age 7 for large breeds and 10 for small breeds.",
    "Large breed dogs (over 50 lbs) have an average lifespan of 8–10 years.",
    "Chihuahuas and Dachshunds frequently live 15–18 years, among the longest of any breed.",
    "Hip dysplasia affects up to 50% of large breed dogs, with symptoms increasing with age.",
    "Dachshunds have a 1 in 4 chance of developing intervertebral disc disease (IVDD).",
    "Boxers have the highest cancer rate of any breed — affecting roughly 40% of individuals.",
    "Hypothyroidism is the most common endocrine disorder in senior dogs, manageable with daily medication.",
    "German Shepherds are predisposed to degenerative myelopathy, a progressive spinal cord disease.",
    "Bulldogs and Pugs are brachycephalic breeds that struggle with heat regulation throughout life.",
    "Senior dogs in shelters are adopted at roughly one-third the rate of puppies.",
    "Pets over 7 make up approximately 25% of U.S. shelter populations.",
    "Cognitive dysfunction syndrome (similar to dementia) affects roughly 30% of dogs over age 11.",
    "Regular dental cleanings can extend a dog's lifespan by an average of 1–3 years.",
    "Senior dogs require 20–30% fewer calories than young adults to maintain healthy weight.",
];

type MascotState = 'idle' | 'hover' | 'active';

const DOG_IMAGES: Record<MascotState, string> = {
    idle: '/mascots/dog-idle.png',
    hover: '/mascots/dog-hover.png',
    active: '/mascots/dog-bark.png',
};

const CAT_IMAGES: Record<MascotState, string> = {
    idle: '/mascots/cat-idle.png',
    hover: '/mascots/cat-hover.png',
    active: '/mascots/cat-meow.png',
};

interface FloatingFact {
    id: number;
    text: string;
    left: number;
    emoji: string;
}

let factId = 0;

export function FactBubbles() {
    const [dogState, setDogState] = useState<MascotState>('idle');
    const [catState, setCatState] = useState<MascotState>('idle');
    const [floatingFacts, setFloatingFacts] = useState<FloatingFact[]>([]);
    const dogFactIndex = useRef(Math.floor(Math.random() * DOG_FACTS.length));
    const catFactIndex = useRef(Math.floor(Math.random() * CAT_FACTS.length));
    const dogCooldown = useRef(false);
    const catCooldown = useRef(false);

    // Preload all images
    useEffect(() => {
        [...Object.values(DOG_IMAGES), ...Object.values(CAT_IMAGES)].forEach((src) => {
            const img = new Image();
            img.src = src;
        });
    }, []);

    const spawnFact = useCallback((side: 'left' | 'right', facts: string[], indexRef: React.MutableRefObject<number>, emoji: string) => {
        const text = facts[indexRef.current];
        indexRef.current = (indexRef.current + 1) % facts.length;
        const left = side === 'left' ? 5 + Math.random() * 15 : 70 + Math.random() * 15;

        const newFact: FloatingFact = { id: factId++, text, left, emoji };
        setFloatingFacts((prev) => [...prev, newFact]);

        setTimeout(() => {
            setFloatingFacts((prev) => prev.filter((f) => f.id !== newFact.id));
        }, 12000);
    }, []);

    const handleDogClick = useCallback(() => {
        if (dogCooldown.current) return;
        dogCooldown.current = true;

        setDogState('active');
        spawnFact('left', DOG_FACTS, dogFactIndex, '🐕');

        setTimeout(() => {
            setDogState('hover');
            dogCooldown.current = false;
        }, 2000);
    }, [spawnFact]);

    const handleCatClick = useCallback(() => {
        if (catCooldown.current) return;
        catCooldown.current = true;

        setCatState('active');
        spawnFact('right', CAT_FACTS, catFactIndex, '🐈');

        setTimeout(() => {
            setCatState('hover');
            catCooldown.current = false;
        }, 2000);
    }, [spawnFact]);



    return (
        <>
            {/* Floating fact bubbles */}
            <div className="fact-float-layer" aria-hidden="true">
                {floatingFacts.map((fact) => (
                    <div
                        key={fact.id}
                        className="fact-float"
                        style={{ left: `${fact.left}%` }}
                    >
                        {fact.emoji} {fact.text}
                    </div>
                ))}
            </div>

            {/* Dog mascot — left side */}
            <button
                className="mascot mascot--left"
                onClick={handleDogClick}
                onMouseEnter={() => { if (dogState === 'idle') setDogState('hover'); }}
                onMouseLeave={() => { if (dogState === 'hover') setDogState('idle'); }}
                aria-label="Click for a dog fact"
                type="button"
            >
                <img
                    src={DOG_IMAGES[dogState]}
                    alt=""
                    className="mascot__img"
                    draggable={false}
                />
            </button>

            {/* Cat mascot — right side */}
            <button
                className="mascot mascot--right"
                onClick={handleCatClick}
                onMouseEnter={() => { if (catState === 'idle') setCatState('hover'); }}
                onMouseLeave={() => { if (catState === 'hover') setCatState('idle'); }}
                aria-label="Click for a cat fact"
                type="button"
            >
                <img
                    src={CAT_IMAGES[catState]}
                    alt=""
                    className="mascot__img"
                    draggable={false}
                />
            </button>
        </>
    );
}
