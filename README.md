# Avalon OS

Aplicación interna de Avalon Core Agency. Base Next.js + TypeScript para despliegue en Vercel y futura integración con Supabase.

## Desarrollo

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Seguridad

- Esta primera versión es una página provisional **sin datos de clientes**.
- No hay login ni autorización implementados: **no usar para información sensible**.
- Las variables reales se configuran en Vercel; nunca subir `.env.local` ni claves secretas.
- Antes de habilitar CRM, finanzas u otros módulos: configurar Supabase Auth, RLS, roles y auditoría.
