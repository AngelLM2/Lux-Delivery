import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { categoriesApi } from '../../../api/categories'
import { Button } from '../../../components/ui/Button'
import { InputField } from '../../../components/ui/Input'
import { EmptyState } from '../../../components/ui/EmptyState'
import { usePageMeta } from '../../../hooks/usePageMeta'
import type { CategoryRead } from '../../../api/types'

export const AdminCategoriesPage = () => {
  const queryClient = useQueryClient()
  const { data = [] } = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list })
  const [editing, setEditing] = useState<CategoryRead | null>(null)
  const [name, setName] = useState('')

  usePageMeta('Admin — Categories')

  const createMutation = useMutation({
    mutationFn: categoriesApi.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { name: string } }) =>
      categoriesApi.update(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: categoriesApi.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  })

  const handleSubmit = async () => {
    if (!name.trim()) return
    if (editing) {
      await updateMutation.mutateAsync({ id: editing.id, payload: { name } })
      setEditing(null)
    } else {
      await createMutation.mutateAsync({ name })
    }
    setName('')
  }

  return (
    <div>
      <header style={{ marginBottom: '1.5rem' }}>
        <p className="kicker" style={{ marginBottom: '0.5rem' }}>Manage</p>
        <h2 className="h1" style={{ margin: 0 }}>Categories</h2>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem' }}>
        <div className="card">
          <h3 className="h3" style={{ margin: 0 }}>{editing ? 'Edit category' : 'New category'}</h3>
          <InputField
            label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button variant="primary" onClick={handleSubmit} disabled={!name.trim()}>
              {editing ? 'Update' : 'Create'}
            </Button>
            {editing && (
              <Button variant="ghost" onClick={() => { setEditing(null); setName('') }}>
                Cancel
              </Button>
            )}
          </div>
        </div>

        <div className="card" style={{ display: 'grid', gap: '0.75rem', alignContent: 'start' }}>
          {data.length === 0 ? (
            <EmptyState title="No categories" description="Create your first catalog category." />
          ) : (
            data.map((category) => (
              <div
                key={category.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem',
                  border: '1px solid var(--color-line)',
                  background: 'var(--color-surface-soft)',
                }}
              >
                <span>{category.name}</span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setEditing(category); setName(category.name) }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => deleteMutation.mutate(category.id)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
