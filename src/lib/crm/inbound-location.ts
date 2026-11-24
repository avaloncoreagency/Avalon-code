/** Private inbox navigation state only. No mutation, credentials or business state. */
export type InboxLocation = { query: string; status: string; focus: string; page: number };
const STATES = ["pending", "approved", "rejected", "converted"];
const FOCUS = ["pending", "possible_spam", "duplicate", "reviewed"];
export function readInboxLocation(params: URLSearchParams): InboxLocation {
  const raw = Number(params.get("page") ?? "0");
  return {
    query: (params.get("q") ?? "").trim().slice(0, 100),
    status: STATES.includes(params.get("status") ?? "") ? params.get("status")! : "",
    focus: FOCUS.includes(params.get("focus") ?? "") ? params.get("focus")! : "",
    page: Number.isSafeInteger(raw) && raw >= 0 ? Math.min(raw, 10000) : 0,
  };
}
export function inboxLocationQuery(state: InboxLocation): string {
  const safe = readInboxLocation(new URLSearchParams({q:state.query,status:state.status,focus:state.focus,page:String(state.page)}));
  const params = new URLSearchParams();
  if (safe.query) params.set("q",safe.query);
  if (safe.status) params.set("status",safe.status);
  if (safe.focus) params.set("focus",safe.focus);
  if (safe.page) params.set("page",String(safe.page));
  return params.size ? "?" + params.toString() : "";
}
