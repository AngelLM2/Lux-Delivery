import { useEffect, useState, type ChangeEvent } from 'react'
import type { CategoryRead, ProductCreate, ProductRead } from '../../api/types'
import { InputField, TextareaField } from '../ui/Input'
import { Button } from '../ui/Button'

type ProductFormProps = {
  categories: CategoryRead[]
  initial?: ProductRead | null
  onSubmit: (payload: ProductCreate, imageFile: File | null, id?: number) => Promise<void>
  onCancel?: () => void
}

const PLACEHOLDER_IMAGE =
  "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='480' height='320'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%230d1015'/%3E%3Cstop offset='100%25' stop-color='%23141820'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='480' height='320' fill='url(%23g)'/%3E%3Crect x='24' y='24' width='432' height='272' fill='none' stroke='%23343a45' stroke-width='2'/%3E%3Ctext x='48' y='170' fill='%239ca3af' font-size='24' font-family='DM Sans, sans-serif'%3EProduct Image%3C/text%3E%3C/svg%3E"

export const ProductForm = ({ categories, initial, onSubmit, onCancel }: ProductFormProps) => {
  const [name, setName] = useState(initial?.name ?? '')
  const [price, setPrice] = useState(initial?.price ? String(initial.price) : '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [shortDescription, setShortDescription] = useState(initial?.short_description ?? '')
  const [categoryId, setCategoryId] = useState(initial?.category_id ? String(initial.category_id) : '')
  const [highlights, setHighlights] = useState(Boolean(initial?.highlights))
  const [isOffer, setIsOffer] = useState(initial?.is_offer ?? false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState(initial?.image_url ?? PLACEHOLDER_IMAGE)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setName(initial?.name ?? '')
    setPrice(initial?.price ? String(initial.price) : '')
    setDescription(initial?.description ?? '')
    setShortDescription(initial?.short_description ?? '')
    setCategoryId(initial?.category_id ? String(initial.category_id) : '')
    setHighlights(Boolean(initial?.highlights))
    setIsOffer(initial?.is_offer ?? false)
    setImageFile(null)
    setPreviewUrl(initial?.image_url ?? PLACEHOLDER_IMAGE)
  }, [initial])

  useEffect(() => {
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [objectUrl])

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null

    if (objectUrl) {
      URL.revokeObjectURL(objectUrl)
      setObjectUrl(null)
    }

    setImageFile(selected)

    if (!selected) {
      setPreviewUrl(initial?.image_url ?? PLACEHOLDER_IMAGE)
      return
    }

    const nextObjectUrl = URL.createObjectURL(selected)
    setObjectUrl(nextObjectUrl)
    setPreviewUrl(nextObjectUrl)
  }

  const handleSubmit = async () => {
    setLoading(true)
    try {
      await onSubmit(
        {
          name,
          price: Number(price.replace(',', '.')),
          description,
          short_description: shortDescription,
          is_offer: isOffer,
          category_id: categoryId ? Number(categoryId) : null,
          highlights: highlights,
        },
        imageFile,
        initial?.id,
      )
    } finally {
      setLoading(false)
    }
  }

  const fileNameLabel = imageFile
    ? imageFile.name
    : initial?.image_url
      ? 'Current image selected'
      : 'No file selected'

  return (
    <div className="product-form-grid">
      <InputField label="Name" value={name} onChange={(event) => setName(event.target.value)} />
      <InputField label="Price" type="number" value={price} onChange={(event) => setPrice(event.target.value)} />

      <label className="input-group">
        <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          <option value="">No category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <span className="helper-text">Category</span>
      </label>

      <TextareaField
        label="Short description"
        value={shortDescription}
        onChange={(event) => setShortDescription(event.target.value)}
      />

      <TextareaField
        label="Full description"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />

      <div className="product-upload-field">
        <span className="field-label">Product image</span>
        <div className="product-upload-control">
          <input
            id="product-image-file"
            className="product-upload-input"
            type="file"
            accept="image/*"
            onChange={handleImageChange}
          />
          <label htmlFor="product-image-file" className="product-upload-button">
            Choose file
          </label>
          <span className="product-upload-name">{fileNameLabel}</span>
        </div>
      </div>

      <div className="product-preview-frame">
        <img src={previewUrl} alt="Product preview" className="product-preview-image" />
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
        <label className="product-offer-toggle" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={highlights} onChange={(event) => setHighlights(event.target.checked)} />
          <span>Destacar na Home</span>
        </label>

        <label className="product-offer-toggle" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={isOffer} onChange={(event) => setIsOffer(event.target.checked)} />
          <span>Mark as promotional</span>
        </label>
      </div>

      <div className="product-form-actions">
        <Button variant="primary" onClick={handleSubmit} isLoading={loading}>
          {initial ? 'Update' : 'Add'}
        </Button>
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  )
}
