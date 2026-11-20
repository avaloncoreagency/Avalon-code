# Avalon OS

Suite administrativa privada de Avalon Core Agency basada en Next.js, TypeScript, Supabase Auth/PostgreSQL y Vercel. Este README describe el repositorio y no certifica que todos los módulos estén desplegados o aceptados en producción.

## Inicio de desarrollo local

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Configure únicamente variables de **desarrollo aislado** según el entorno autorizado. No copie valores de producción, claves, cookies ni información real de clientes. No conecte un Preview a la base de datos productiva; mantenga los controles de seguridad y la separación de entornos.

## Verificaciones

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

La presencia de estos comandos no implica resultados exitosos. Documente el commit SHA exacto, el entorno, el resultado y cualquier suite no ejecutada. Tests locales o CI no sustituyen la validación en navegador ni la aceptación de producción.

## Acceso y seguridad

El código contiene una pantalla de acceso administrativo en `/admin/login`, que reutiliza `src/app/login/page.tsx`. El inicio de sesión llama a `getAuthorizedMember` y renderiza `LoginPanel`; el acceso debe permanecer limitado a las identidades autorizadas por políticas y membresías verificadas. La presencia de código de autenticación **no demuestra** que la configuración remota, RLS o login de ambos propietarios funcionen actualmente. Verificar antes de usar información sensible.

- No subir `.env.local`, secretos, tokens, claves de servicio, información privada de clientes ni contratos reales. **Este repositorio es público** en la inspección de 2026-11-20.
- Mantener límites de propietario y tenant, validación del servidor y RLS; no asumir permisos por correo o datos editables.
- No ejecutar migraciones en producción, publicar deployments, habilitar proveedores de pago, Radar ni procesos de IA sin autorización y verificación previa.

## Fuentes de verdad y coordinación

- [Cooperación Dev Bridge](docs/dev-bridge/COOPERATION.md): ramas aisladas, SHA, Issue/PR, verificación y handoff.
- [Knowledge — índice de conocimiento](docs/knowledge/README.md): documentación organizada, estados de vigencia y fuentes.
- [Control documental](docs/knowledge/DOCUMENT_CONTROL.md): clasificación, revisión y custodia.
- [Decisiones registradas](docs/knowledge/DECISION_REGISTER.md): directrices identificadas, propuestas y aprobaciones pendientes.
- [Innovación](docs/knowledge/INNOVATION_BACKLOG.md): oportunidades no autorizadas a ejecutarse.

Los documentos `PROJECT_STATE.md` y algunos checkpoints son históricos; antes de actuar compare la fuente con `main`, PR abiertos y la evidencia de la fecha y entorno pertinentes.
