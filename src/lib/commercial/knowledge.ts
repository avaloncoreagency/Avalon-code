/** Client-isolated knowledge authorization policy. No provider or retrieval engine. */
export type KnowledgeProduct = "chatbot" | "receptionist";
export type KnowledgeDocument = {
 clientId:string;sourceId:string;version:number;locale:"es"|"en";
 approval:"draft"|"approved"|"revoked";
 approvedBy:string|null;approvedAtMs:number|null;reviewDueAtMs:number|null;
 allowedProducts:readonly KnowledgeProduct[];
 text:string;
};
export type KnowledgeDecision={usable:boolean;reason:"approved"|"wrong_client"|"not_approved"|"revoked"|"wrong_product"|"expired"|"invalid"};
export function canUseKnowledge(doc:KnowledgeDocument,clientId:string,product:KnowledgeProduct,nowMs:number):KnowledgeDecision{
 if(!doc || !clientId || !Number.isFinite(nowMs))return {usable:false,reason:"invalid"};
 if(!doc.clientId || doc.clientId!==clientId)return {usable:false,reason:"wrong_client"};
 if(doc.approval==="revoked")return {usable:false,reason:"revoked"};
 if(doc.approval!=="approved" || !doc.approvedBy || !doc.approvedAtMs)return {usable:false,reason:"not_approved"};
 if(!doc.allowedProducts.includes(product))return {usable:false,reason:"wrong_product"};
 if(!doc.sourceId || !Number.isSafeInteger(doc.version) || doc.version<1 || !doc.text.trim() ||
    doc.text.length>20000 || doc.approvedAtMs>nowMs)return {usable:false,reason:"invalid"};
 if(doc.reviewDueAtMs!==null && (!Number.isFinite(doc.reviewDueAtMs)||nowMs>=doc.reviewDueAtMs))
   return {usable:false,reason:"expired"};
 return {usable:true,reason:"approved"};
}
export const INDUSTRY_KNOWLEDGE:readonly {key:string;name:string;topics:readonly string[];warning:string}[]=[
 {key:"hvac",name:"HVAC",topics:["Cobertura ZIP","Horarios verificados","Reparaciones","Solicitudes de reemplazo","Escalamiento"],warning:"No diagnosticar electricidad o refrigerantes ni cotizar sin técnico."},
 {key:"roofing",name:"Roofing",topics:["Inspecciones","Materiales","Cobertura","Cotizaciones"],warning:"No garantizar cobertura de seguros o permisos."},
 {key:"fencing",name:"Fencing",topics:["Materiales","Medidas","Visitas","Plazos"],warning:"No inventar precios por pie."},
 {key:"barber",name:"Barber",topics:["Servicios","Duración","Profesionales","Reservas"],warning:"No confirmar disponibilidad sin calendario."},
 {key:"tattoo",name:"Tattoo",topics:["Estilos","Política de edad","Depósitos","Consulta"],warning:"No ignorar restricciones de edad."},
 {key:"restaurant",name:"Restaurant",topics:["Menú verificado","Horario","Reservas","Alérgenos"],warning:"No inventar ingredientes o seguridad alimentaria."},
 {key:"cleaning",name:"Cleaning",topics:["Alcance","Área","Tipos de servicio","Cotización"],warning:"No prometer duración sin visita."},
 {key:"ecommerce",name:"E-commerce",topics:["Pedidos","Devoluciones","Entrega","Pagos"],warning:"Exigir autenticación antes de consultar órdenes."}
];
