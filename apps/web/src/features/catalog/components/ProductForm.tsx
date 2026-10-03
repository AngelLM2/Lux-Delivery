import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import type { CategoryRead, ProductCreate, ProductRead } from '../../../shared/api/types'
import { FORM_ERROR_KEY, getApiErrorMessage, getFieldErrors } from '../../../shared/lib/errors'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { InputField, SelectField, TextareaField } from '../../../shared/ui/Input'

type ProductFormProps = {
  categories: CategoryRead[]
  /** Product being edited. The parent remounts the form (`key`) when it changes. */
  initial?: ProductRead | null
  onSubmit: (payload: ProductCreate, imageFile: File | null) => Promise<unknown>
  onCancel?: () => void
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024

const PLACEHOLDER_IMAGE =
  "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='480' height='320'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%230d1015'/%3E%3Cstop offset='100%25' stop-color='%23141820'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='480' height='320' fill='url(%23g)'/%3E%3Crect x='24' y='24' width='432' height='272' fill='none' stroke='%23343a45' stroke-width='2'/%3E%3Ctext x='48' y='170' fill='%239ca3af' font-size='24' font-family='DM Sans, sans-serif'%3EImagem do produto%3C/text%3E%3C/svg%3E"

/** Accepts "12.5", "12,50" and "1.234,56". */
const parsePrice = (value: string) => {
  const trimmed = value.trim()
  return Number(trimmed.includes(',') ? trimmed.replace(/\./g, '').replace(',', '.') : trimmed)
}

export const ProductForm = ({ categories, initial, onSubmit, onCancel }: ProductFormProps) => {
  const [name, setName] = useState(initial?.name ?? '')
  const [price, setPrice] = useState(initial ? String(initial.price).replace('.', ',') : '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [shortDescription, setShortDescription] = useState(initial?.short_description ?? '')
  const [categoryId, setCategoryId] = useState(initial?.category_id != null ? String(initial.category_id) : '')
  const [highlights, setHighlights] = useState(initial?.highlights ?? false)
  const [isOffer, setIsOffer] = useState(initial?.is_offer ?? false)
  const [isAvailable, setIsAvailable] = useState(initial?.is_available ?? true)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Revoke the previous preview URL when it is replaced or the form unmounts.
  useEffect(() => {
    if (!objectUrl) return
    return () => URL.revokeObjectURL(objectUrl)
  }, [objectUrl])

  const previewUrl = objectUrl ?? initial?.image_url ?? PLACEHOLDER_IMAGE

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null
    if (selected && selected.size > MAX_IMAGE_BYTES) {
      setErrors((prev) => ({ ...prev, image: 'A imagem deve ter no máximo 5 MB.' }))
      event.target.value = ''
      return
    }
    setErrors((prev) => {
      const next = { ...prev }
      delete next.image
      return next
    })
    setImageFile(selected)
    setObjectUrl(selected ? URL.createObjectURL(selected) : null)
  }

  const validate = () => {
    const next: Record<string, string> = {}
    if (name.trim().length < 2) next.name = 'Informe um nome com pelo menos 2 caracteres.'
    const parsed = parsePrice(price)
    if (!Number.isFinite(parsed) || parsed <= 0) next.price = 'Informe um preço maior que zero.'
    return next
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    const clientErrors = validate()
    setErrors(clientErrors)
    if (Object.keys(clientErrors).length > 0) return

    setLoading(true)
    try {
      await onSubmit(
        {
          name: name.trim(),
          price: parsePrice(price),
          description: description.trim(),
          short_description: shortDescription.trim(),
          is_offer: isOffer,
          highlights,
          is_available: isAvailable,
          category_id: categoryId ? Number(categoryId) : null,
        },
        imageFile,
      )
    } catch (error) {
      const fields = getFieldErrors(error)
      setErrors(fields)
      if (Object.keys(fields).length === 0 || fields[FORM_ERROR_KEY]) {
        setFormError(fields[FORM_ERROR_KEY] ?? getApiErrorMessage(error))
      }
    } finally {
      setLoading(false)
    }
  }

  const fileNameLabel = imageFile
    ? imageFile.name
    : initial?.image_url
      ? 'Imagem atual mantida'
      : 'Nenhum arquivo selecionado'

  return (
    <form className="product-form-grid" onSubmit={handleSubmit} noValidate>
      {formError && <Alert tone="danger">{formError}</Alert>}

      <InputField label="Nome" value={name} onChange={(event) => setName(event.target.value)} error={errors.name} />
      <InputField
        label="Preço (R$)"
        inputMode="decimal"
        placeholder="0,00"
        value={price}
        onChange={(event) => setPrice(event.target.value)}
        error={errors.price}
      />

      <SelectField
        label="Categoria"
        value={categoryId}
        onChange={(event) => setCategoryId(event.target.value)}
        error={errors.category_id}
      >
        <option value="">Sem categoria</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </SelectField>

      <TextareaField
        label="Descrição curta"
        rows={2}
        maxLength={255}
        value={shortDescription}
        onChange={(event) => setShortDescription(event.target.value)}
        error={errors.short_description}
      />

      <TextareaField
        label="Descrição completa"
        maxLength={1000}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        error={errors.description}
      />

      <div className="product-upload-field">
        <span className="field-label">Imagem do produto</span>
        <div className="product-upload-control">
          <input
            id="product-image-file"
            className="product-upload-input"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleImageChange}
          />
          <label htmlFor="product-image-file" className="product-upload-button">
            Escolher arquivo
          </label>
          <span className="product-upload-name">{fileNameLabel}</span>
        </div>
        {errors.image && (
          <span className="helper-text" style={{ color: 'var(--color-error)' }}>
            {errors.image}
          </span>
        )}
      </div>

      <div className="product-preview-frame">
        <img src={previewUrl} alt="Pré-visualização do produto" className="product-preview-image" />
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
        <label className="product-offer-toggle" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={isAvailable} onChange={(event) => setIsAvailable(event.target.checked)} />
          <span>Disponível para venda</span>
        </label>
        <label className="product-offer-toggle" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={highlights} onChange={(event) => setHighlights(event.target.checked)} />
          <span>Destacar na home</span>
        </label>
        <label className="product-offer-toggle" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={isOffer} onChange={(event) => setIsOffer(event.target.checked)} />
          <span>Marcar como oferta</span>
        </label>
      </div>

      <div className="product-form-actions">
        <Button variant="primary" type="submit" isLoading={loading}>
          {initial ? 'Salvar alterações' : 'Cadastrar produto'}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  )
}
