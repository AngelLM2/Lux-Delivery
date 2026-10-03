import { useEffect } from 'react'

const SITE_NAME = 'Lux Delivery'

/** Sets `<title>` (suffixed with the site name) and, optionally, the meta description. */
export const usePageMeta = (title: string, description?: string) => {
  useEffect(() => {
    document.title = title.includes(SITE_NAME) || title.startsWith('LUX') ? title : `${title} — ${SITE_NAME}`
    if (description) {
      document.querySelector('meta[name="description"]')?.setAttribute('content', description)
    }
  }, [title, description])
}
