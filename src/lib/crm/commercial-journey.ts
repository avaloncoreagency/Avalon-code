/** Presentation-only advice. Never persists stages, commercial terms or closing decisions. */
export type JourneyAction = 'review' | 'sale' | 'quotes' | 'contract' | 'close' | 'diagnosis' | 'create_quote' | 'contact' | 'followup' | 'history';
export function journeyAction(input: { stage: string; diagnosis: string; unavailable: boolean; sales: number; quotes: number; accepted: number; verifiedContract: boolean }): JourneyAction {
  if (input.unavailable) return 'review';
  if (input.stage === 'lost') return 'history';
  if (input.sales > 0) return 'sale';
  if (input.accepted > 1) return 'quotes';
  if (input.accepted === 1) return input.verifiedContract ? 'close' : 'contract';
  if (input.quotes > 0) return 'quotes';
  if (input.diagnosis === 'complete') return 'create_quote';
  if (['qualified','meeting','diagnosed','proposal','negotiation','won'].includes(input.stage)) return 'diagnosis';
  return input.stage === 'nurture' || input.stage === 'contact-pending' ? 'followup' : 'contact';
}
