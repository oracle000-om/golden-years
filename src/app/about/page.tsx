export default function AboutPage() {
    return (
        <section className="hero" style={{ minHeight: 'auto', paddingTop: '3rem' }}>
            <h1 className="hero__title" style={{ fontSize: '2.5rem' }}>About Golden Years Club</h1>

            <div className="hero__mission" style={{ borderTop: 'none', paddingTop: 0 }}>
                <h2>Why This Exists</h2>
                <p>
                    Senior animals are the most overlooked in shelters. Puppies and kittens get
                    adopted quickly. Young adults have a chance. But the old ones — the 10-year-old
                    lab who spent a decade as someone&apos;s best friend, the 14-year-old cat who
                    just lost her owner — they&apos;re often the first on the euthanasia list and
                    the last to be seen.
                </p>
                <p style={{ marginTop: '1rem' }}>
                    Golden Years Club exists to change that. We aggregate data from county shelter
                    websites, Facebook rescue cross-posts, and other reliable sources to surface
                    senior animals who are running out of time. We show you who they are, where they
                    are, and when their time is up.
                </p>
            </div>

            <div className="hero__mission">
                <h2>How It Works</h2>
                <p>
                    <strong>Data Collection:</strong> We pull listings from county shelter websites
                    and rescue cross-posts. Each animal&apos;s photo, intake ID, shelter information,
                    and estimated age are captured.
                </p>
                <p style={{ marginTop: '1rem' }}>
                    <strong>Age Estimation:</strong> When a shelter doesn&apos;t report an animal&apos;s
                    age, we use computer vision to estimate an age range, accompanied by a confidence
                    score so you know how reliable the estimate is.
                </p>
                <p style={{ marginTop: '1rem' }}>
                    <strong>Trust Scores:</strong> Each shelter is assigned a trust score based on
                    the percentage of their intake that is euthanized. This gives you context about
                    the urgency and environment at each facility.
                </p>
                <p style={{ marginTop: '1rem' }}>
                    <strong>Time-of-Death Markers:</strong> Instead of a stressful countdown timer,
                    we display the scheduled euthanasia date and time as a factual marker. You can
                    filter by timeframe to find animals with the most urgent need.
                </p>
            </div>

            <div className="hero__mission">
                <h2>The Goal</h2>
                <p>
                    We&apos;re not here to make money. We&apos;re here to make sure no senior animal
                    dies unseen. If you&apos;re a rescuer, a foster, or someone who can share a post —
                    you can save a life. Every pair of eyes on a listing is another chance.
                </p>
            </div>
        </section>
    );
}
