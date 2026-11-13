import type { Bi } from "./catalog";
/** Human checklists, not an alternative CRM or task storage system. */
export const SALES_PHASES: readonly {key:string;title:Bi;checks:readonly Bi[]}[] = [
 {key:"capture",title:["Captación","Capture"],checks:[["Origen verificable y contacto autorizado","Verified source and permitted contact"],["Revisar posibles duplicados","Check potential duplicates"]]},
 {key:"discovery",title:["Descubrimiento","Discovery"],checks:[["Objetivo, urgencia y responsable","Goal, urgency and decision maker"],["Industria, capacidad y presupuesto","Industry, capacity and budget"],["Documentar datos desconocidos","Record unknown facts explicitly"]]},
 {key:"proposal",title:["Propuesta","Proposal"],checks:[["Alcance y exclusiones claros","Clear scope and exclusions"],["Costos, impuestos y proveedores separados","Separate costs, taxes and third parties"],["Versión y vigencia","Version and validity period"]]},
 {key:"contract",title:["Contrato y venta","Contract and sale"],checks:[["Firma y verificación registradas","Signature and verification recorded"],["No cambiar a Ganado sin gate CRM","Never bypass CRM Won gate"]]},
 {key:"onboarding",title:["Inicio del proyecto","Onboarding"],checks:[["Accesos delegados, sin contraseñas en texto","Delegated access, no plaintext passwords"],["Materiales, plazos y responsables","Materials, timeline and owners"],["Criterios de aceptación acordados","Agreed acceptance criteria"]]},
 {key:"delivery",title:["Entrega y postventa","Delivery and aftercare"],checks:[["QA y evidencia","QA and evidence"],["Aprobación del cliente y documentación","Client acceptance and documentation"],["Soporte y cambios de alcance definidos","Support and scope changes defined"]]}
];
export const INDUSTRY_DISCOVERY:readonly {key:string;title:Bi;questions:readonly Bi[]}[]=[
 {key:"contractor",title:["Contratistas","Contractors"],questions:[["¿Cuál es el trabajo promedio y margen conocido?","Average job value and known margin?"],["¿Qué ZIPs y capacidad de trabajo cubres?","Which ZIPs and job capacity do you cover?"],["¿Quién da seguimiento a las cotizaciones?","Who follows up on quotes?"],["¿Qué licencias y seguros aplican?","Which licenses and insurance apply?"]]},
 {key:"local",title:["Negocios con citas","Appointment businesses"],questions:[["¿Cuántas reservas puedes aceptar?","How many bookings can you take?"],["¿Cuáles servicios y profesionales manejas?","Which services and professionals do you offer?"],["¿Cómo confirmas y cancelas una cita?","How are appointments confirmed and canceled?"]]},
 {key:"retail",title:["Comercio y e-commerce","Retail and e-commerce"],questions:[["¿Cuántos productos y variantes tienes?","How many products and variants?"],["¿Cómo gestionas inventario y devoluciones?","How are inventory and returns handled?"],["¿Quién gestiona impuestos, pagos y envíos?","Who handles taxes, payments and shipping?"]]}
];
