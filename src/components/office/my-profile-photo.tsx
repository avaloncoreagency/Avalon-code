"use client";
import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "@/app/admin/profile/staff-profile.module.css";

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
  return (
    <div className={styles.photoRow}>
      {photoHash ? (
        // Private authenticated avatar route; next/image optimization cannot access its cookies.
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.photoAvatar} src={`/admin/workspace/crm/office/photo/${userId}?v=${photoHash}`}
          alt={name} width={92} height={92} />
      ) : (
        <span className={styles.photoAvatar} role="img" aria-label={name}>{name.slice(0,1).toUpperCase()}</span>
      )}
      <div className={styles.photoDetails}>
        <strong>Tu foto de perfil</strong>
        <small>Personaliza cómo te ve el equipo en Oficina, tareas y en la barra superior.</small>
        <small>PNG, JPG o WEBP · máximo 700 KB</small>
        <label className={styles.fileLabel}>
          {busy ? "Actualizando foto…" : photoHash ? "Cambiar fotografía" : "Agregar fotografía"}
          <input className={styles.visuallyHidden} type="file" accept=".png,.jpg,.jpeg,.webp"
            disabled={busy} onChange={upload} aria-label="Cambiar foto de perfil"/>
        </label>
        {message && <span role="status">{message}</span>}
      </div>
    </div>
  );
}
