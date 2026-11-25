export const commercialPermissions = [
  ["lead_create", "Crear leads propios", "Create own leads"],
  ["lead_edit", "Editar leads propios", "Edit own leads"],
  ["quote_create", "Crear cotizaciones", "Create quotes"],
  ["quote_edit", "Editar cotizaciones propias", "Edit own quotes"],
  ["quote_review", "Solicitar revisión", "Request review"],
  ["quote_send", "Enviar cotizaciones aprobadas", "Present approved quotes"],
  ["quote_accept", "Registrar aceptación", "Record acceptance"],
  ["quote_delete_request", "Solicitar eliminación", "Request deletion"],
  ["sale_close", "Cerrar ventas propias", "Close own sales"],
  ["sales_history", "Consultar ventas propias", "View own sales"],
  ["commission_history", "Consultar comisiones propias", "View own commissions"],
] as const;
