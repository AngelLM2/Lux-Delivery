import { Pencil, Plus, Trash2 } from 'lucide-react'
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
import { AdminPageHeader } from '../components/AdminPageHeader'

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
    <div className="admin-page">
      <AdminPageHeader
        title="Categorias"
        meta={isPending || isError ? undefined : `${categories.length} seções no cardápio`}
      />

      <div className="admin-split">
        <section className="card admin-card admin-list-card" aria-labelledby="categories-title">
          <h2 id="categories-title" className="sr-only">Categorias</h2>
          {isPending ? (
            <div className="admin-rows">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} height={56} />
              ))}
            </div>
          ) : isError ? (
            <Alert tone="danger">Não foi possível carregar as categorias.</Alert>
          ) : categories.length === 0 ? (
            <EmptyState title="Nenhuma categoria" description="Crie a primeira categoria do cardápio." />
          ) : (
            <ul className="admin-rows" aria-label="Categorias">
              {categories.map((category) => (
                <li
                  key={category.id}
                  className={`admin-row admin-category-grid ${editing?.id === category.id ? 'is-selected' : ''}`}
                >
                  <span className="admin-position" title="Posição no cardápio">
                    {category.position}
                  </span>
                  <strong className="admin-row-main">{category.name}</strong>
                  <span className="admin-row-actions">
                    <button
                      type="button"
                      className="icon-action"
                      onClick={() => startEditing(category)}
                      aria-label={`Editar ${category.name}`}
                      title="Editar"
                    >
                      <Pencil size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="icon-action is-danger"
                      onClick={() => setDeleteTarget(category)}
                      aria-label={`Remover ${category.name}`}
                      title="Remover"
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <form className="card admin-card admin-sticky" onSubmit={handleSubmit} noValidate>
          <div className="admin-card-head">
            <h2 className="h3">{editing ? 'Editar categoria' : 'Nova categoria'}</h2>
            {editing && <span className="caption">{editing.name}</span>}
          </div>
          {formError && <Alert tone="danger">{formError}</Alert>}
          <InputField label="Nome" maxLength={100} value={name} onChange={(event) => setName(event.target.value)} error={errors.name} />
          <InputField
            label="Ordem no cardápio (0 = primeira)"
            type="number"
            min={0}
            max={10000}
            value={position}
            onChange={(event) => setPosition(event.target.value)}
            error={errors.position}
          />
          <div className="admin-form-actions">
            {editing && (
              <Button variant="ghost" onClick={resetForm}>
                Cancelar
              </Button>
            )}
            <Button
              variant="primary"
              type="submit"
              isLoading={saveCategory.isPending}
              icon={editing ? undefined : <Plus size={16} aria-hidden="true" />}
            >
              {editing ? 'Salvar' : 'Criar categoria'}
            </Button>
          </div>
        </form>
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
