# Seguridad de IA (AI Receptionist y futuras integraciones)

**Estado actual:** no hay ningún proveedor de IA conectado. `src/lib/os/integrations.ts` marca todas las integraciones como `not_connected`, y los adaptadores devuelven `null`. La AI Receptionist solo **genera un prompt** a partir de su configuración y su base de conocimiento; no conversa con nadie ni ejecuta acciones.

Antes de conectar un modelo (Anthropic, OpenAI u otro), deben estar implementados y probados estos controles:

| Riesgo | Control obligatorio |
|---|---|
| Inyección de prompt (instrucciones ocultas en mensajes, documentos o FAQ) | El prompt de sistema separa las instrucciones de los datos. El contenido del cliente va dentro de delimitadores y se trata como datos, nunca como órdenes. Pruebas con casos de inyección conocidos. |
| Filtración de datos entre clientes | Cada asistente pertenece a un proyecto, y la consulta de conocimiento filtra por `project_id` con RLS. Nunca se comparte contexto entre proyectos. |
| Acceso indebido a herramientas | Lista cerrada de herramientas por asistente, con permisos de solo lectura por defecto. Sin acceso a secretos ni a otras tablas. |
| Acciones no autorizadas | Las acciones de alto impacto (enviar correos, publicar, cobrar, borrar o cambiar datos) **requieren aprobación humana** en Avalon OS. El modelo solo propone. |
| Gastos inesperados | Tope de tokens por conversación y por día, tope mensual de gasto en el panel del proveedor y alertas. Sin contratación sin aprobación (regla del proyecto). |
| Uso excesivo o abuso | Límite de mensajes por número o sesión, igual que el limitador del login. |
| Exposición de conversaciones | Se guardan con RLS por proyecto y retención limitada. No se registran tokens, contraseñas ni datos de pago. |
| Respuestas con información confidencial | Filtro de salida para datos personales y secretos, y el prompt prohíbe revelar instrucciones internas. |
| Manipulación de documentos recuperados (RAG) | Solo se indexan documentos que el propietario aprobó. Se guarda el origen de cada fragmento y el índice es por proyecto. |
| Clave del proveedor | Solo en una variable de entorno del servidor, nunca en `NEXT_PUBLIC_*`, y distinta para Preview y para Production. |

**Observabilidad:** registrar por conversación el modelo, los tokens, la herramienta usada, la decisión (aprobada o rechazada) y quién aprobó, sin guardar el contenido sensible.

**Referencias:** OWASP Top 10 for LLM Applications, y la guía de seguridad del proveedor elegido.
