import Link from "next/link";

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="hero__haiku">
          A long life I&apos;ve lived<br />
          Only to die in a cage<br />
          Held by a stranger
        </div>

        <h1 className="hero__title">Golden Years Club</h1>

        <p className="hero__subtitle">
          Surfacing senior animals on shelter euthanasia lists — giving them
          visibility, dignity, and a last chance.
        </p>

        <Link href="/listings" className="hero__cta">
          View Listings →
        </Link>

        <div className="hero__mission">
          <h2>The Mission</h2>
          <p>
            Every day, senior animals — dogs and cats who have lived long,
            loyal lives — are placed on euthanasia lists at shelters across the
            country. Many are never seen. Their photos aren&apos;t shared. Their
            stories aren&apos;t told. They run out of time in silence.
          </p>
          <p style={{ marginTop: '1rem' }}>
            Golden Years Club aggregates euthanasia list data from county shelters,
            rescue cross-posts, and other reliable sources into one place. We
            show you who&apos;s running out of time, where they are, and how to help.
          </p>
        </div>
      </section>
    </>
  );
}
