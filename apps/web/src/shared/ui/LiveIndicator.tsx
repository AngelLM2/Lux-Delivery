export type LiveStatus = 'idle' | 'connecting' | 'open' | 'reconnecting'

/** Small "Ao vivo" pill shown on screens that update through Server-Sent Events. */
export const LiveIndicator = ({ status }: { status: LiveStatus }) => {
  if (status === 'idle') return null
  const live = status === 'open'
  return (
    <span
      className={`live-indicator ${live ? 'is-live' : ''}`}
      role="status"
      title={live ? 'Atualizações em tempo real ativas' : 'Reconectando ao servidor de eventos'}
    >
      <span className="live-indicator-dot" aria-hidden="true" />
      {live ? 'Ao vivo' : 'Reconectando...'}
    </span>
  )
}
