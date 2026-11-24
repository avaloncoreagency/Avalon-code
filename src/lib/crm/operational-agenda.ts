/** Respect custom closed stage kinds as well as the standard stage IDs. */
export function activeFollowup(stage: string, closedStages: readonly string[]): boolean {
  return !['won', 'lost', ...closedStages].includes(stage);
}
export function agendaIncomplete(...errors: unknown[]): boolean { return errors.some(Boolean); }
