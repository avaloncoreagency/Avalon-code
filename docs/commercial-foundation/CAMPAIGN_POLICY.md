# Campaigns and funnels — safe launch policy

## Agency B2B
Avalon advertises its own authorized services and uses existing B2B funnel/CRM paths for voluntary inquiries only. Do not treat an inquiry as a sale or booked appointment.

## Contractor B2C
Contractor campaign is a separate audience and backend. Do not reuse `crm_growth_funnel_submit` for homeowner routing. Display and obtain agreement with actual contractor identity and appropriate disclosures before delivery. Check contractor license, coverage, approved budget, signed terms, privacy notice and legal review.

## Proposed campaign messages
See `src/lib/commercial/campaigns.ts` and the private owner page `/admin/workspace/marketing-hub/commercial/campaigns`. Marketing templates are not ad accounts or published assets.

## Automation gates
`reviewCampaign` reports `blocked` or `review_only`, and intentionally has **no** state that publishes an ad. It cannot create leads, spend funds or issue outbound messages.

## Measurement
Only verified conversions and spend. Distinguish unique contacts from submissions and cash from quotes. Run controlled A/B tests only after platform and legal approvals. Do not promise results or lower price guarantees without evidence.