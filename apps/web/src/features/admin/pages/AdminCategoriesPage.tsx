import { useState, type FormEvent } from 'react'
import type { CategoryRead } from '../../../shared/api/types'
import { usePageMeta } from '../../../shared/hooks/usePageMeta'
import { getApiErrorMessage, getFieldErrors } from '../../../shared/lib/errors'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { EmptyState } from '../../../shared/ui/EmptyState'
import { InputField } from '../../../shared/ui/Input'
import { Modal } from '../../../shared/ui/Modal'
import { Skeleton } from '../../../shared/ui/Skeleton'
import { useCategories, useDeleteCategory, useSaveCategory } from '../../catalog/hooks'

export const AdminCategoriesPage = () => {
  const { data: categories = [], isPending, isError } = useCategories({ fresh: true })
  const saveCategory = useSaveCategory()
  const deleteCategory = useDeleteCategory()
  const [editing, setEditing] = useState<CategoryRead | null>(null)
  const [name, setName] = useState('')
  const [position, setPosition] = useState('0')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CategoryRead | null>(null)

  usePageMeta('Categorias — Admin')

  const resetForm = () => {
    setEditing(null)
    setName('')
    setPosition('0')
    setErrors({})
    setFormError(null)
  }

  const startEditing = (category: CategoryRead) => {
    setEditing(category)
    setName(category.name)
    setPosition(String(category.position))
    setErrors({})
    setFormError(null)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const parsedPosition = Number(position)
    const clientErrors: Record<string, string> = {}
    if (name.trim().length < 2) clientErrors.name = 'Informe um nome com pelo menos 2 caracteres.'
    if (!Number.isInteger(parsedPosition) || parsedPosition < 0) clientErrors.position = 'Use um número inteiro a partir de 0.'
    setErrors(clientErrors)
    setFormError(null)
    if (Object.keys(clientErrors).length > 0) return

    try {
      await saveCategory.mutateAsync({ id: editing?.id, payload: { name: name.trim(), position: parsedPosition } })
      resetForm()
    } catch (error) {
      const fields = getFieldErrors(error)
      setErrors(fields)
      if (Object.keys(fields).length === 0) setFormError(getApiErrorMessage(error))
    }
  }

  return (
    <div>
      <header style={{ marginBottom: '1.5rem' }}>
        <p className="kicker" style={{ marginBottom: '0.5rem' }}>Catálogo</p>
        <h2 className="h1" style={{ margin: 0 }}>Categorias</h2>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
        <form className="card" onSubmit={handleSubmit} noValidate>
          <h3 className="h3" style={{ margin: 0 }}>{editing ? 'Editar categoria' : 'Nova categoria'}</h3>
          {formError && <Alert tone="danger">{formError}</Alert>}
          <InputField label="Nome" maxLength={100} value={name} onChange={(event) => setName(event.target.value)} error={errors.name} />
          <InputField
            label="Posição no cardápio"
            type="number"
            min={0}
            max={10000}
            value={position}
            onChange={(event) => setPosition(event.target.value)}
            error={errors.position}
          />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button variant="primary" type="submit" isLoading={saveCategory.isPending}>
              {editing ? 'Salvar' : 'Criar'}
            </Button>
            {editing && (
              <Button variant="ghost" onClick={resetForm}>
                Cancelar
              </Button>
            )}
          </div>
        </form>

        <div className="card" style={{ display: 'grid', gap: '0.75rem', alignContent: 'start' }}>
          {isPending ? (
            Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} height={56} />)
          ) : isError ? (
            <Alert tone="danger">Não foi possível carregar as categorias.</Alert>
          ) : categories.length === 0 ? (
            <EmptyState title="Nenhuma categoria" description="Crie a primeira categoria do cardápio." />
          ) : (
            categories.map((category) => (
              <div key={category.id} className="admin-list-row">
                <span>
                  <span className="caption" style={{ marginRight: '0.5rem' }}>#{category.position}</span>
                  {category.name}
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <Button variant="outline" size="sm" onClick={() => startEditing(category)}>
                    Editar
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => setDeleteTarget(category)}>
                    Remover
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <Modal
        isOpen={deleteTarget !== null}
        title={`Remover "${deleteTarget?.name ?? ''}"?`}
        description="Os produtos desta categoria ficarão sem categoria."
        onClose={() => setDeleteTarget(null)}
        onConfirm={() =>
          deleteTarget &&
          deleteCategory.mutate(deleteTarget.id, {
            onSettled: () => {
              if (editing?.id === deleteTarget.id) resetForm()
              setDeleteTarget(null)
            },
          })
        }
        confirmLabel="Remover"
        confirmVariant="danger"
        isConfirming={deleteCategory.isPending}
      />
    </div>
  )
}
