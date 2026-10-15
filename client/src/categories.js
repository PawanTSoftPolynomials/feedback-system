// Feedback sections. Must match CATEGORIES in server/lib/content.js.
export const CATEGORIES = [
  { id: 'lms', label: 'LMS' },
  { id: 'course', label: 'Course' },
];

export const DEFAULT_CATEGORY = 'lms';

export const categoryLabel = (id) => (CATEGORIES.find((c) => c.id === id) || { label: 'Other' }).label;

/** Splits items into [{ id, label, items }] per section, keeping their order. Empty sections are dropped. */
export function groupByCategory(items, getCategory = (item) => item.category) {
  const known = CATEGORIES.map((c) => ({ ...c, items: items.filter((item) => getCategory(item) === c.id) }));
  const other = items.filter((item) => !CATEGORIES.some((c) => c.id === getCategory(item)));
  return [...known, { id: 'other', label: 'Other', items: other }].filter((group) => group.items.length > 0);
}
