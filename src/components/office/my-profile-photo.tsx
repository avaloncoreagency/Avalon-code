"use client";
import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";

export function MyProfilePhoto({ userId, photoHash, name }: { userId: string; photoHash: string | null; name: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/png","image/jpeg","image/webp"].includes(file.type) || file.size > 700 * 1024) {
      setMessage("Selecciona PNG, JPG o WEBP de hasta 700 KB.");
      event.target.value = "";
      return;
    }
    setBusy(true); setMessage("");
    try {
      const form = new FormData();
      form.set("photo", file);
      const response = await fetch("/admin/workspace/crm/office/photo/" + userId, { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar.");
      setMessage("Foto actualizada.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar la foto.");
    } finally { setBusy(false); event.target.value = ""; }
  };
  return <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
    {photoHash ? <img src={`/admin/workspace/crm/office/photo/${userId}?v=${photoHash}`} alt={name} width={78} height={78}
      style={{ width: 78, height: 78, objectFit: "cover", borderRadius: "50%" }} /> :
      <span aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 78, height: 78, borderRadius: "50%", background: "var(--surface-2, #334155)", color: "white", fontSize: 28 }}>{name.slice(0,1).toUpperCase()}</span>}
    <label style={{ display: "grid", gap: 5 }}>
      <strong>Foto de perfil</strong>
      <input type="file" accept=".png,.jpg,.jpeg,.webp" disabled={busy} onChange={upload} aria-label="Cambiar foto de perfil" />
      <small>PNG, JPG o WEBP · máximo 700 KB</small>
    </label>
    {message && <span role="status">{message}</span>}
  </div>;
}
