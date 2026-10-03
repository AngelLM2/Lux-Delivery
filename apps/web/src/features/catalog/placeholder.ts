/**
 * Inline SVG used when a product has no photo. A data URI keeps it CSP-friendly
 * (`img-src 'self' data:`), unlike third-party placeholder services.
 */
export const productPlaceholder = (name: string) => {
  const label = (name.length > 18 ? `${name.slice(0, 18)}...` : name)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='480'>
    <defs>
      <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
        <stop offset='0%' stop-color='#141820'/>
        <stop offset='100%' stop-color='#0d1015'/>
      </linearGradient>
    </defs>
    <rect width='640' height='480' fill='url(#g)'/>
    <text x='40' y='250' fill='#f3f4f6' font-size='28' font-family='system-ui, sans-serif' opacity='0.8'>${label}</text>
  </svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
