import type { SupabaseClient } from "@supabase/supabase-js";

export const QUOTE_CANDIDATE_PAGE_SIZE = 50;

export type QuoteCandidate = {
  id: string;
  quote_number: string;
  title: string;
  status: string;
  current_version: number;
  lead: { company: string } | null;
  client: { legal_name: string } | null;
};

export function quoteCandidateQuery(db: SupabaseClient, statuses: string[], search: string, page: number) {
  const columns = [
    "id,quote_number,title,status,current_version",
    "lead:crm_leads!crm_quotes_lead_id_fkey!inner(company)",
    "client:crm_clients!crm_quotes_client_id_fkey(legal_name)",
    "linked_sale:crm_sales!crm_sales_quote_id_fkey()",
  ];
  if (search) {
    columns.push("lead_match:crm_leads!crm_quotes_lead_id_fkey()", "client_match:crm_clients!crm_quotes_client_id_fkey()");
  }
  const query = db.from("crm_quotes").select(columns.join(","), { count: "exact" })
    .in("status", statuses)
    .is("deleted_at", null)
    .is("linked_sale", null)
    .eq("lead.archived", false)
    .neq("client.status", "archived")
    .or("client_id.is.null,client.not.is.null");

  if (search) {
    // imatch finds a literal substring once regex metacharacters are escaped.
    // The top-level OR also needs quoting for PostgREST's logic grammar.
    const literal = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const quoted = '"' + literal.replace(/[\\"]/g, "\\$&") + '"';
    query.filter("lead_match.company", "imatch", literal)
      .filter("client_match.legal_name", "imatch", literal)
      .or(`quote_number.imatch.${quoted},title.imatch.${quoted},lead_match.not.is.null,client_match.not.is.null`);
  }

  const offset = page * QUOTE_CANDIDATE_PAGE_SIZE;
  return query.order("updated_at", { ascending: false }).order("id")
    .range(offset, offset + QUOTE_CANDIDATE_PAGE_SIZE - 1);
}
