import type { InfiniteData } from '@tanstack/react-query'
import type { Page } from './types'

/** Default page size requested from cursor-paginated endpoints. */
export const PAGE_SIZE = 20

/** `useInfiniteQuery` options shared by every `{ items, next_cursor }` endpoint. */
export const cursorPagination = {
  initialPageParam: undefined as string | undefined,
  getNextPageParam: <T>(lastPage: Page<T>) => lastPage.next_cursor ?? undefined,
}

/** Flattens the pages of an infinite query into a single list. */
export const flattenPages = <T>(data: InfiniteData<Page<T>, unknown> | undefined): T[] =>
  data?.pages.flatMap((page) => page.items) ?? []

/** Maps the items of every page (used for in-place cache updates). */
export const mapPages = <T>(
  data: InfiniteData<Page<T>, unknown> | undefined,
  map: (item: T) => T,
): InfiniteData<Page<T>, unknown> | undefined =>
  data && { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.map(map) })) }
