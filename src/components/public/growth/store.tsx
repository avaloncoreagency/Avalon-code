"use client";
import { createContext, useEffect, useContext, useMemo, useReducer, type ReactNode } from "react";
import { readDemoLink } from "./share-link";
import type { Lang } from "../landing/copy";
import { INDUSTRIES, type IndustryKey } from "./industries";

/**
 * One synthetic world shared by the tree, the industry selector, the six demos and the integrated journey.
 * Everything lives in memory in the visitor's browser: no Supabase, no network, no real records. Reset = new world.
 *
 * Cause → effect: an ad brings a lead → the chat books it → the calendar holds the slot → the CRM moves it → a won
 * deal is a sale → every sale ripens one golden apple on the branch that produced it.
 */
export const STAGES = ["new", "contacted", "appointment", "quote", "negotiation", "won"] as const;
export type Stage = (typeof STAGES)[number];
export type Source = "seed" | "ads" | "chat" | "calendar" | "search" | "shop" | "journey";
/** Tree branches: each one is a work multiplier, explained by its result. */
export const BRANCH_OF: Record<Source, number> = { chat: 0, calendar: 1, seed: 2, journey: 2, search: 3, shop: 4, ads: 5 };

export type Lead = { id: number; name: string; need: string; value: number; stage: Stage; source: Source; at: number };
export type Booking = { id: number; day: number; slot: number; service: number; name: string; leadId?: number };
export type Sale = { id: number; amount: number; label: string; source: Source; leadId?: number };
export type Fruit = { id: number; branch: number };

export type DemoState = {
  lang: Lang; industry: IndustryKey; seq: number; resetEpoch: number;
  leads: Lead[]; bookings: Booking[]; sales: Sale[];
  inquiries: { received: number; answered: number; booked: number };
  /** Apples earned by demo sales that the tree has not yet placed on a branch. */
  fruitQueue: Fruit[];
  feed: { id: number; text: string; source: Source }[];
};

type Action =
  | { type: "industry"; industry: IndustryKey }
  | { type: "reset" }
  | { type: "lead"; name: string; need: string; value: number; source: Source; stage?: Stage; note?: string }
  | { type: "move"; id: number; stage: Stage }
  | { type: "book"; day: number; slot: number; service: number; name: string; leadId?: number; source?: Source }
  | { type: "rebook"; id: number; day: number; slot: number }
  | { type: "cancel"; id: number }
  | { type: "inquiry"; answered?: boolean; booked?: boolean }
  | { type: "sale"; amount: number; label: string; source: Source; name?: string; need?: string }
  | { type: "fruitTaken"; id: number }
  | { type: "note"; text: string; source: Source };

const STAGE_LABEL: Record<Lang, Record<Stage, string>> = {
  es: { new: "Nuevo", contacted: "Contactado", appointment: "Cita", quote: "Cotización", negotiation: "Negociación", won: "Cerrado" },
  en: { new: "New", contacted: "Contacted", appointment: "Appointment", quote: "Quote", negotiation: "Negotiation", won: "Won" },
};
export const stageLabel = (lang: Lang, s: Stage) => STAGE_LABEL[lang][s];

function seed(lang: Lang, industry: IndustryKey, resetEpoch = 0): DemoState {
  const ind = INDUSTRIES[industry];
  const stages: Stage[] = ["new", "contacted", "appointment", "quote"];
  const leads = ind.leads.map((x, i) => ({ id: i + 1, name: x.name, need: x.need[lang], value: x.value, stage: stages[i % stages.length], source: "seed" as Source, at: 0 }));
  const bookings: Booking[] = [{ id: 101, day: 0, slot: 2, service: 0, name: ind.leads[0].name, leadId: 1 }, { id: 102, day: 1, slot: 5, service: 1, name: ind.leads[2].name }, { id: 103, day: 3, slot: 1, service: 2, name: ind.leads[3].name }];
  return { lang, industry, resetEpoch, seq: 200, leads, bookings, sales: [], inquiries: { received: 0, answered: 0, booked: 0 }, fruitQueue: [], feed: [] };
}

const push = (s: DemoState, text: string, source: Source) => ({ ...s, feed: [{ id: s.seq + 1, text, source }, ...s.feed].slice(0, 8), seq: s.seq + 1 });

function win(s: DemoState, lead: Lead, label: string): DemoState {
  const id = s.seq + 1;
  const sale: Sale = { id, amount: lead.value, label, source: lead.source, leadId: lead.id };
  const fruit: Fruit = { id, branch: BRANCH_OF[lead.source] };
  return push({ ...s, seq: id, sales: [sale, ...s.sales], fruitQueue: [...s.fruitQueue, fruit] }, `${label}: ${lead.name} · $${lead.value.toLocaleString("en-US")}`, lead.source);
}

function reducer(s: DemoState, a: Action): DemoState {
  const t = (es: string, en: string) => (s.lang === "es" ? es : en);
  switch (a.type) {
    case "industry": return a.industry === s.industry ? s : seed(s.lang, a.industry, s.resetEpoch + 1);
    case "reset": return seed(s.lang, s.industry, s.resetEpoch + 1);
    case "lead": {
      const id = s.seq + 1;
      const lead: Lead = { id, name: a.name, need: a.need, value: a.value, stage: a.stage ?? "new", source: a.source, at: Date.now() };
      return push({ ...s, seq: id, leads: [lead, ...s.leads] }, a.note ?? t(`Nueva oportunidad: ${a.name}`, `New opportunity: ${a.name}`), a.source);
    }
    case "move": {
      const lead = s.leads.find(x => x.id === a.id); if (!lead || lead.stage === a.stage) return s;
      const moved = { ...lead, stage: a.stage };
      let next: DemoState = { ...s, leads: s.leads.map(x => (x.id === a.id ? moved : x)) };
      if (a.stage === "won" && !s.sales.some(x => x.leadId === a.id)) next = win(next, moved, INDUSTRIES[s.industry].wonLabel[s.lang]);
      else next = push(next, `${lead.name} → ${STAGE_LABEL[s.lang][a.stage]}`, lead.source);
      return next;
    }
    case "book": {
      const id = s.seq + 1;
      if (s.bookings.some(b => b.day === a.day && b.slot === a.slot)) return s;
      return push({ ...s, seq: id, bookings: [...s.bookings, { id, day: a.day, slot: a.slot, service: a.service, name: a.name, leadId: a.leadId }] },
        t(`Cita reservada: ${a.name}`, `Appointment booked: ${a.name}`), a.source ?? "calendar");
    }
    case "rebook":
      if (s.bookings.some(b => b.day === a.day && b.slot === a.slot)) return s;
      return push({ ...s, bookings: s.bookings.map(b => (b.id === a.id ? { ...b, day: a.day, slot: a.slot } : b)) }, t("Cita movida", "Appointment moved"), "calendar");
    case "cancel": return push({ ...s, bookings: s.bookings.filter(b => b.id !== a.id) }, t("Cita cancelada · hueco disponible", "Appointment cancelled · slot freed"), "calendar");
    case "inquiry": return { ...s, inquiries: { received: s.inquiries.received + (a.answered || a.booked ? 0 : 1), answered: s.inquiries.answered + (a.answered ? 1 : 0), booked: s.inquiries.booked + (a.booked ? 1 : 0) } };
    case "sale": {
      const id = s.seq + 1;
      const lead: Lead = { id, name: a.name ?? t("Cliente demo", "Demo customer"), need: a.need ?? a.label, value: a.amount, stage: "won", source: a.source, at: Date.now() };
      return win({ ...s, seq: id, leads: [lead, ...s.leads] }, lead, a.label);
    }
    case "fruitTaken": return { ...s, fruitQueue: s.fruitQueue.filter(f => f.id !== a.id) };
    case "note": return push(s, a.text, a.source);
  }
}

type Ctx = { state: DemoState; dispatch: (a: Action) => void };
const DemoContext = createContext<Ctx | null>(null);

export function DemoProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => seed(lang, "barber"));
  useEffect(() => { dispatch({ type: "industry", industry: readDemoLink(window.location.search).industry }); }, []);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const c = useContext(DemoContext);
  if (!c) throw new Error("useDemo outside DemoProvider");
  return c;
}
