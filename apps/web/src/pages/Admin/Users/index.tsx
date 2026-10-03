import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usersApi } from '../../../api/users'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/Badge'
import { EmptyState } from '../../../components/ui/EmptyState'
import { usePageMeta } from '../../../hooks/usePageMeta'

export const AdminUsersPage = () => {
  const queryClient = useQueryClient()
  const { data = [] } = useQuery({ queryKey: ['users'], queryFn: usersApi.list })

  usePageMeta('Admin — Users')

  const deactivate = useMutation({
    mutationFn: (id: number) => usersApi.deactivate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    retry: 0,
  })

  const activate = useMutation({
    mutationFn: (id: number) => usersApi.activate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    retry: 0,
  })

  return (
    <div>
      <header style={{ marginBottom: '1.5rem' }}>
        <p className="kicker" style={{ marginBottom: '0.5rem' }}>Manage</p>
        <h2 className="h1" style={{ margin: 0 }}>Users</h2>
      </header>

      <div className="card" style={{ display: 'grid', gap: '0.75rem' }}>
        {data.length === 0 ? (
          <EmptyState title="No users" description="Add your first team member or customer." />
        ) : (
          data.map((user) => (
            <div
              key={user.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
                padding: '0.75rem',
                border: '1px solid var(--color-line)',
                background: 'var(--color-surface-soft)',
              }}
            >
              <div style={{ display: 'grid', gap: '0.25rem' }}>
                <strong>{user.full_name}</strong>
                <span className="caption">{user.email} - {user.role}</span>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <Badge tone={user.is_active ? 'success' : 'error'}>
                  {user.is_active ? 'Active' : 'Inactive'}
                </Badge>
                {user.is_active ? (
                  <Button variant="danger" size="sm" onClick={() => deactivate.mutate(user.id)}>
                    Deactivate
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => activate.mutate(user.id)}>
                    Reactivate
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
