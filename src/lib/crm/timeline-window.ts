/** Pure, presentation-only window over immutable CRM timeline events.
 * No events are deduplicated, rewritten or deleted; filters and the default
 * eight-row preview are only visual. Backend limits remain authoritative.
 */
export type TimelineFilter = "all" | "stage" | "activity" | "edit" | "file";
export type TimelineRow = { type: Exclude<TimelineFilter, "all"> };

export function timelineWindow<T extends TimelineRow>(
  entries: readonly T[],
  filter: TimelineFilter,
  showAll: boolean,
  previewSize = 8,
): { visible: T[]; matching: number; hidden: number } {
  const matching = filter === "all" ? [...entries] : entries.filter(entry => entry.type === filter);
  const visible = showAll ? matching : matching.slice(0, Math.max(1, previewSize));
  return { visible, matching: matching.length, hidden: matching.length - visible.length };
}
