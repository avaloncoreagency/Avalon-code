// Keep suggested_price unchanged so missing/default-price negative cases remain meaningful.
// Disposable databases only: explicit owner approval prerequisites, never a production bootstrap.
module.exports=async function approveFixtureOffers(db,owner,offers){
 await db.exec('begin; set local role authenticated');
 try{await db.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
 for(const [code,price] of offers){await db.query('update public.crm_service_catalog set monthly_price=$2 where code=$1',[code,price]);await db.query("update public.crm_service_catalog set offer_status='approved' where code=$1",[code]);}
 await db.exec('commit');}catch(error){await db.exec('rollback');throw error;}
};
