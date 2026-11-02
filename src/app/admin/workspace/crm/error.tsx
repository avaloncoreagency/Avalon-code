"use client";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <section role="alert">
      <h2>No se pudo abrir el CRM</h2>
      <button onClick={reset}>Reintentar</button>
    </section>
  );
}
