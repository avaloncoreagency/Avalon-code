-- Read-only aggregate diagnostics. No names, UUIDs, file content or customer data returned.
-- Run with a trusted read-only audit role: owner RLS can hide rows and is not a full DB audit.
-- Zero findings is meaningful only alongside coverage counts; empty tables prove no business flow.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '10s';
WITH findings AS (
 SELECT 'invoice_sale_client_mismatch' code, 'P1' severity, count(*) n FROM crm_invoices i JOIN crm_sales s ON s.id=i.sale_id WHERE i.client_id IS DISTINCT FROM s.client_id
 UNION ALL SELECT 'payment_invoice_sale_mismatch','P1',count(*) FROM crm_payments p JOIN crm_invoices i ON i.id=p.invoice_id WHERE p.sale_id IS DISTINCT FROM i.sale_id
 UNION ALL SELECT 'commission_sale_client_mismatch','P1',count(*) FROM crm_commissions c JOIN crm_sales s ON s.id=c.sale_id WHERE c.client_id IS DISTINCT FROM s.client_id
 UNION ALL SELECT 'work_order_sale_client_mismatch','P1',count(*) FROM crm_work_orders w JOIN crm_sales s ON s.id=w.sale_id WHERE w.client_id IS DISTINCT FROM s.client_id
 UNION ALL SELECT 'work_order_project_client_mismatch','P1',count(*) FROM crm_work_orders w JOIN os_projects p ON p.id=w.project_id WHERE p.client_id IS DISTINCT FROM w.client_id
 UNION ALL SELECT 'contract_terms_lead_mismatch','P1',count(*) FROM crm_contracts c JOIN crm_commercial_terms t ON t.id=c.terms_id WHERE c.lead_id IS DISTINCT FROM t.lead_id
 UNION ALL SELECT 'quote_current_version_missing','P1',count(*) FROM crm_quotes q WHERE NOT EXISTS (SELECT 1 FROM crm_quote_versions v WHERE v.quote_id=q.id AND v.version_no=q.current_version)
 UNION ALL SELECT 'agreement_quote_client_mismatch','P1',count(*) FROM crm_client_agreement_drafts d JOIN crm_quote_versions v ON v.id=d.quote_version_id JOIN crm_quotes q ON q.id=v.quote_id WHERE d.client_id IS DISTINCT FROM q.client_id
 UNION ALL SELECT 'invoice_currency_mismatch','P1',count(*) FROM crm_invoices i JOIN crm_sales s ON s.id=i.sale_id WHERE i.currency<>s.currency
 UNION ALL SELECT 'payment_currency_mismatch','P1',count(*) FROM crm_payments p JOIN crm_sales s ON s.id=p.sale_id WHERE p.currency<>s.currency
 UNION ALL SELECT 'invoice_total_exceeds_sale','P1',count(*) FROM crm_sales s WHERE (SELECT coalesce(sum(i.amount),0) FROM crm_invoices i WHERE i.sale_id=s.id AND i.status='issued')>s.total
 UNION ALL SELECT 'verified_payment_missing_evidence','P1',count(*) FROM crm_payments WHERE status='verified' AND (verified_by IS NULL OR verified_at IS NULL OR btrim(evidence)='')
 UNION ALL SELECT 'orphan_sale_client','P1',count(*) FROM crm_sales s LEFT JOIN crm_clients c ON c.id=s.client_id WHERE c.id IS NULL
 UNION ALL SELECT 'orphan_project_client','P1',count(*) FROM os_projects p LEFT JOIN crm_clients c ON c.id=p.client_id WHERE p.client_id IS NOT NULL AND c.id IS NULL
 UNION ALL SELECT 'duplicate_sale_request','P1',count(*) FROM (SELECT idempotency_key FROM crm_sales GROUP BY idempotency_key HAVING count(*)>1)x
 UNION ALL SELECT 'duplicate_quote_request','P1',count(*) FROM (SELECT request_key FROM crm_quotes GROUP BY request_key HAVING count(*)>1)x
 UNION ALL SELECT 'duplicate_client_name_review','P2',count(*) FROM (SELECT lower(btrim(legal_name)) FROM crm_clients GROUP BY lower(btrim(legal_name)) HAVING count(*)>1)x
 UNION ALL SELECT 'multiple_clients_for_origin_lead_review','P2',count(*) FROM (SELECT origin_lead_id FROM crm_clients WHERE origin_lead_id IS NOT NULL GROUP BY origin_lead_id HAVING count(*)>1)x
 UNION ALL SELECT 'client_without_origin_lead_review','P2',count(*) FROM crm_clients WHERE origin_lead_id IS NULL
 UNION ALL SELECT 'project_without_client_review','P2',count(*) FROM os_projects WHERE client_id IS NULL
)
SELECT jsonb_build_object(
 'coverage',jsonb_build_object('clients',(SELECT count(*) FROM crm_clients),'leads',(SELECT count(*) FROM crm_leads),'sales',(SELECT count(*) FROM crm_sales),'quotes',(SELECT count(*) FROM crm_quotes),'contracts',(SELECT count(*) FROM crm_contracts),'invoices',(SELECT count(*) FROM crm_invoices),'payments',(SELECT count(*) FROM crm_payments),'commissions',(SELECT count(*) FROM crm_commissions),'products',(SELECT count(*) FROM os_projects)),
 'checks',jsonb_agg(jsonb_build_object('code',code,'severity',severity,'count',n) ORDER BY code)
) AS commercial_integrity FROM findings;
ROLLBACK;
