// Pure merge rules for the sync queue: decide whether two versions of a record really
// differ before asking the user to choose.

// Fields that change on every write but don't change what the record means.
const VOLATILE = new Set(['rev', 'doneAt', 'updatedAt', 'lastSynced']);

function meaning(value: unknown): string {
  if (!value || typeof value !== 'object') return JSON.stringify(value ?? null);
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([k]) => !VOLATILE.has(k))
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
}

/**
 * True when both versions say the same thing, e.g. the same step marked done on two
 * devices at different times. That is not a real conflict, so nobody needs to be asked.
 */
export function sameMeaning(mine: unknown, theirs: unknown): boolean {
  return meaning(mine) === meaning(theirs);
}
