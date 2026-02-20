export default function Loading() {
    return (
        <div className="listings-page">
            <div className="container">
                <div className="listings-header">
                    <span className="page-badge">📡 Live List</span>
                </div>

                <p className="listings-header__description">
                    Dedicated to delivering seniors to warm, loving forever homes.
                </p>

                <div className="skeleton-search">
                    <div className="skeleton skeleton--search" />
                </div>

                <div className="skeleton-filters">
                    <div className="skeleton skeleton--filter" />
                    <div className="skeleton skeleton--filter" />
                    <div className="skeleton skeleton--filter" />
                    <div className="skeleton skeleton--filter" />
                </div>

                <div className="skeleton-count">
                    <div className="skeleton skeleton--text-sm" />
                </div>

                <div className="card-grid">
                    {Array.from({ length: 12 }).map((_, i) => (
                        <div key={i} className="skeleton-card">
                            <div className="skeleton skeleton--image" />
                            <div className="skeleton-card__body">
                                <div className="skeleton skeleton--text-lg" />
                                <div className="skeleton skeleton--text-sm" />
                                <div className="skeleton skeleton--text-md" />
                                <div className="skeleton skeleton--text-md" />
                                <div className="skeleton skeleton--text-md" />
                            </div>
                            <div className="skeleton-card__footer">
                                <div className="skeleton skeleton--text-sm" />
                                <div className="skeleton skeleton--text-md" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
