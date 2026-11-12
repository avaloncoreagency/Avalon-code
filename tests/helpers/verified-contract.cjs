// Records and verifies a synthetic signed contract for a lead through every required state (CRM Intelligence gate:
// no lead enters a won stage without a verified signed contract). Runs as the current session user (an owner).
module.exports = async function verifiedContract(db, leadId, title = 'Acuerdo sintético') {
  const q = async (sql, p) => (await db.query(sql, p)).rows[0];
  const c = await q("insert into crm_contracts(lead_id, title) values($1,$2) returning id", [leadId, title]);
  await db.query("update crm_contracts set status='sent_for_signature' where id=$1", [c.id]);
  await db.query("update crm_contracts set status='signed_pending_verification', signed_at=now(), signer_name='Firmante Sintético', external_reference='SYNTHETIC-ENVELOPE-001' where id=$1", [c.id]);
  await db.query("update crm_contracts set status='verified_signed', verification_method='document_review', verification_note='Documento firmado revisado por un owner (sintético).' where id=$1", [c.id]);
  return c.id;
};
