export const HomeSkeletonGrid = () => (
  <div className="home-grid" aria-busy="true" aria-label="Carregando destaques">
    {[0, 1, 2].map((i) => (
      <div key={i} className="home-card home-card-skeleton">
        <div className="home-card-image skeleton-block" style={{ height: '220px' }} />
        <div className="home-card-content">
          <div className="skeleton-block skeleton-title" />
          <div className="skeleton-block skeleton-text" />
          <div className="skeleton-block skeleton-text skeleton-text--short" />
          <div className="home-card-footer" style={{ marginTop: '1rem' }}>
            <div className="skeleton-block skeleton-price" />
          </div>
        </div>
      </div>
    ))}
  </div>
)
