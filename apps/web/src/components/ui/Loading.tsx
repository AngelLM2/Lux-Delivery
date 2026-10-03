import { Spinner } from './Spinner'

export const Loading = ({ label = 'Carregando...' }: { label?: string }) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
      <Spinner size={20} />
      <span className="body-text">{label}</span>
    </div>
  )
}
