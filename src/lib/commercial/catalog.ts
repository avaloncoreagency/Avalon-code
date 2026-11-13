/** Read-only package proposals; NOT CRM Service Factory SKU or authorized rates. */
export type Bi = readonly [string,string];
export type Offer = {
 id:string; name:Bi; description:Bi; starter:readonly Bi[]; growth:readonly Bi[];
 exclusions:readonly Bi[]; pricing:{setupStarter:number;setupGrowth:number;monthlyStarter:number;monthlyGrowth:number};
};
export const OFFERS:readonly Offer[]=[
 {id:"website",name:["Website Designer","Website Designer"],
 description:["Sitios web para captar oportunidades","Websites for inbound opportunities"],
 starter:[["Hasta cinco páginas responsive","Up to five responsive pages"],["Formulario y SEO básico","Form and basic SEO"],["Una revisión","One revision"]],
 growth:[["Hasta diez páginas","Up to ten pages"],["Dos rondas de revisiones y conversión","Two revision rounds and conversion sections"]],
 exclusions:[["Hosting, dominio y publicidad","Hosting, domain and advertising"]],
 pricing:{setupStarter:999,setupGrowth:1999,monthlyStarter:79,monthlyGrowth:149}},
 {id:"ecommerce",name:["E-commerce Designer","E-commerce Designer"],
 description:["Tienda con carrito y checkout autorizado","Storefront with cart and authorized checkout"],
 starter:[["Hasta veinte productos suministrados","Up to twenty provided products"],["Checkout de prueba","Sandbox checkout"]],
 growth:[["Hasta cien productos y variantes","Up to one hundred products and variants"],["Colecciones y promociones acordadas","Agreed collections and promotions"]],
 exclusions:[["Logística, impuestos y tarifas del procesador","Fulfillment, taxes and processor fees"]],
 pricing:{setupStarter:1999,setupGrowth:3499,monthlyStarter:149,monthlyGrowth:249}},
 {id:"crm",name:["CRM Creator","CRM Creator"],
 description:["Seguimiento comercial personalizado","Customized sales management"],
 starter:[["Contactos, etapas y campos","Contacts, stages and fields"],["Roles básicos","Basic roles"]],
 growth:[["Reportes y formularios","Reports and forms"],["Importación validada","Validated import"]],
 exclusions:[["Licencias y migraciones ilimitadas","Licenses and unlimited migrations"]],
 pricing:{setupStarter:2499,setupGrowth:4999,monthlyStarter:249,monthlyGrowth:499}},
 {id:"chatbot",name:["AI Chatbots","AI Chatbots"],
 description:["Atención web con información aprobada","Web support with approved knowledge"],
 starter:[["Hasta cincuenta FAQs revisadas","Up to fifty reviewed FAQs"],["Transferencia a humanos","Human handoff"]],
 growth:[["Flujos e idiomas adicionales","Additional flows and languages"],["Integraciones aprobadas","Approved integrations"]],
 exclusions:[["Consumo ilimitado y precisión garantizada","Unlimited usage and guaranteed accuracy"]],
 pricing:{setupStarter:899,setupGrowth:1799,monthlyStarter:149,monthlyGrowth:249}},
 {id:"receptionist",name:["AI Receptionist","AI Receptionist"],
 description:["Recepción de llamadas y derivación","Call intake and handoff"],
 starter:[["FAQs, horarios y escalamiento","FAQs, hours and escalation"]],
 growth:[["Departamentos y flujos acordados","Agreed departments and flows"],["Reportes si hay conexión","Reports if connected"]],
 exclusions:[["Minutos, telefonía y grabaciones no autorizadas","Minutes, telephony and unauthorized recording"]],
 pricing:{setupStarter:1499,setupGrowth:2699,monthlyStarter:249,monthlyGrowth:399}},
 {id:"growth",name:["Marketing Hub & Funnels","Marketing Hub & Funnels"],
 description:["Captación y seguimiento medible","Measurable acquisition and follow-up"],
 starter:[["Un funnel y formulario","One funnel and form"],["Informe interno de origen","Internal origin report"]],
 growth:[["Dos funnels y pruebas A/B","Two funnels and A/B tests"],["Optimización acordada","Agreed optimization"]],
 exclusions:[["Gasto publicitario y garantía de ventas","Ad spend and guaranteed sales"]],
 pricing:{setupStarter:899,setupGrowth:1799,monthlyStarter:399,monthlyGrowth:699}}
];
export function commercialProposal(offer:Offer,tier:"starter"|"growth"){
 return {status:"unapproved_proposal" as const,setupUsd:tier==="starter"?offer.pricing.setupStarter:offer.pricing.setupGrowth,
 monthlyUsd:tier==="starter"?offer.pricing.monthlyStarter:offer.pricing.monthlyGrowth};
}
