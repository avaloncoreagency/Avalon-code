import { addContact, updateClient, updateContact } from "@/app/admin/workspace/crm/clients/actions";
import { pick, type Lang } from "@/lib/i18n";
import s from "./sales.module.css";
import styles from "./client-edit-panel.module.css";

export type EditableClient = {
  id: string; version: number; legal_name: string; trade_name: string; website: string;
  industry: string; country: string; location: string; source: string; status: string; notes: string;
};
export type EditableContact = {
  id: string; version: number; full_name: string; email: string | null;
  phone: string; role: string; is_primary: boolean;
};

/** Canonical CRM client and contacts; owner-gated actions persist to existing rows. */
export function ClientEditPanel({ client, contacts, unavailable, lang, open }: {
  client: EditableClient; contacts: EditableContact[]; unavailable: boolean; lang: Lang; open: boolean;
}) {
  const t = (es: string, en: string) => pick(lang, es, en);
  return (
    <details className={styles.editor} id="client-edit" open={open}>
      <summary className={styles.summary}>{t("Editar ficha y contactos", "Edit profile and contacts")}
        <span>{t("Nombre, dirección, teléfono, correo, notas y responsables", "Name, location, phone, email, notes and contacts")}</span>
      </summary>
      <div className={styles.body}>
        <p className={styles.hint}>{t("Todos los cambios se guardan en el cliente existente. Un conflicto de versión evita sobrescribir lo que guardó otro propietario.", "Changes update this existing client. Version conflicts prevent overwriting another owner's edits.")}</p>
        <form action={updateClient} className={s.form}>
          <input type="hidden" name="client_id" value={client.id} />
          <input type="hidden" name="version" value={client.version} />
          <h3>{t("Datos del negocio", "Business information")}</h3>
          <div className={styles.grid}>
            <label className={s.field}>{t("Nombre legal o comercial registrado *", "Legal or registered business name *")}
              <input name="legal_name" required maxLength={200} defaultValue={client.legal_name} />
            </label>
            <label className={s.field}>{t("Nombre público / marca", "Public / trade name")}
              <input name="trade_name" maxLength={200} defaultValue={client.trade_name} />
            </label>
            <label className={s.field}>{t("Industria o actividad", "Industry / business type")}
              <input name="industry" maxLength={120} defaultValue={client.industry} />
            </label>
            <label className={s.field}>{t("Página web", "Website")}
              <input name="website" type="url" maxLength={500} placeholder="https://ejemplo.com" defaultValue={client.website} />
            </label>
            <label className={s.field}>{t("Dirección o ubicación", "Address or location")}
              <input name="location" maxLength={200} defaultValue={client.location} />
            </label>
            <label className={s.field}>{t("País", "Country")}
              <input name="country" maxLength={80} defaultValue={client.country} />
            </label>
            <label className={s.field}>{t("Origen del cliente *", "Client source *")}
              <input name="source" required maxLength={200} defaultValue={client.source} />
            </label>
            <label className={s.field}>{t("Estado", "Status")}
              <select name="status" defaultValue={client.status} required>
                <option value="active">{t("Activo", "Active")}</option>
                <option value="inactive">{t("Inactivo", "Inactive")}</option>
                <option value="archived">{t("Archivado", "Archived")}</option>
              </select>
            </label>
          </div>
          <label className={s.field}>{t("Notas internas y contexto comercial", "Internal notes and business context")}
            <textarea name="notes" maxLength={4000} rows={4} defaultValue={client.notes} />
          </label>
          <button className={styles.save} type="submit">{t("Guardar datos del cliente", "Save client details")}</button>
        </form>
        <section className={styles.contacts} aria-label={t("Editar contactos", "Edit contacts")}>
          <h3>{t("Personas de contacto", "Contact people")}</h3>
          {unavailable
            ? <p role="alert">{t("Los contactos no están disponibles. No se mostrarán datos incompletos.", "Contacts could not be loaded. Incomplete data is not shown.")}</p>
            : contacts.length === 0
              ? <p className={styles.hint}>{t("Todavía no hay contactos. Agrega el primero.", "No contacts yet. Add the first contact.")}</p>
              : <div className={styles.contactList}>{contacts.map(contact => (
                  <details key={contact.id} className={styles.contact}>
                    <summary>{contact.full_name} {contact.is_primary && <span className={styles.primary}>{t("Principal", "Primary")}</span>}
                      <span className={styles.contactMeta}>{[contact.role, contact.phone, contact.email].filter(Boolean).join(" · ")}</span>
                    </summary>
                    <form action={updateContact} className={s.form}>
                      <input type="hidden" name="client_id" value={client.id} />
                      <input type="hidden" name="contact_id" value={contact.id} />
                      <input type="hidden" name="version" value={contact.version} />
                      <div className={styles.grid}>
                        <label className={s.field}>{t("Nombre *", "Name *")}
                          <input name="full_name" required maxLength={160} defaultValue={contact.full_name} />
                        </label>
                        <label className={s.field}>{t("Cargo o relación", "Role or relationship")}
                          <input name="role" maxLength={120} defaultValue={contact.role} />
                        </label>
                        <label className={s.field}>{t("Teléfono", "Phone")}
                          <input name="phone" type="tel" maxLength={40} defaultValue={contact.phone} />
                        </label>
                        <label className={s.field}>Email
                          <input name="email" type="email" maxLength={254} defaultValue={contact.email ?? ""} />
                        </label>
                      </div>
                      <p className={styles.hint}>{t("Se conserva la designación de contacto principal. Para cambiarla se necesita una operación específica con control de duplicados.", "Primary designation is unchanged. Switching it requires a dedicated operation that guards against duplicates.")}</p>
                      <button type="submit" className={styles.save}>{t("Guardar contacto", "Save contact")}</button>
                    </form>
                  </details>
                ))}</div>}
          <details className={styles.add}>
            <summary>{t("+ Agregar nuevo contacto", "+ Add new contact")}</summary>
            <form action={addContact} className={s.form}>
              <input type="hidden" name="client_id" value={client.id} />
              <div className={styles.grid}>
                <label className={s.field}>{t("Nombre *", "Name *")}<input name="full_name" required maxLength={160}/></label>
                <label className={s.field}>{t("Correo", "Email")}<input name="email" type="email" maxLength={254}/></label>
                <label className={s.field}>{t("Teléfono", "Phone")}<input name="phone" type="tel" maxLength={40}/></label>
                <label className={s.field}>{t("Cargo", "Role")}<input name="role" maxLength={120}/></label>
              </div>
              <button className={styles.save} type="submit">{t("Agregar contacto", "Add contact")}</button>
            </form>
          </details>
        </section>
      </div>
    </details>
  );
}
