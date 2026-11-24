import Image from "next/image";
import type { GalleryAsset } from "./gallery-logic";
import { GALLERY_LABELS } from "./gallery-logic";
import { CreativeModel } from "./model-viewer";
import styles from "./media.module.css";

const TYPE_NAMES: Record<GalleryAsset["kind"], string> = {
  image: "Imagen", video: "Video", model: "Modelo 3D",
};

/** Display only available, content-addressed local resources. Never claim publication. */
export function CreativeAsset({ asset }: { asset: GalleryAsset }) {
  const available = asset.state === "imported" && Boolean(asset.publicPath);
  return <figure className={styles.asset}>
    <div className={styles.assetHeading}>
      <span className={styles.typeTag}>{TYPE_NAMES[asset.kind]}</span>
      <span className={`${styles.assetState} ${styles[asset.state]}`}>{GALLERY_LABELS[asset.state]}</span>
    </div>
    {available && asset.publicPath ? (
      <div className={styles.mediaFrame}>
        {asset.kind === "image" ? <Image
          src={asset.publicPath} alt={asset.alt || "Recurso visual"}
          width={1200} height={750}
          sizes="(max-width: 760px) 100vw, (max-width: 1200px) 50vw, 360px"
          className={styles.image} /> :
        asset.kind === "video" && asset.posterPath ? <div className={styles.videoWrap}>
          <video src={asset.publicPath} controls preload="none" playsInline
            poster={asset.posterPath} aria-label={asset.alt} className={styles.motion} />
          <div className={styles.still}><Image src={asset.posterPath} alt={asset.alt}
            width={1200} height={750} sizes="(max-width: 760px) 100vw, 360px"
            className={styles.image} /></div>
        </div> :
        asset.kind === "model" ? <CreativeModel src={asset.publicPath} label={asset.alt || asset.id} /> :
        <p role="status">Video sin alternativa verificada. No se reproduce.</p>}
      </div>
    ) : <div className={styles.unavailable} role="status">
      <span aria-hidden="true">◇</span>
      <strong>{asset.state === "blocked" ? "Recurso no disponible" : "Importación pendiente"}</strong>
      <p>{asset.state === "blocked"
        ? "El archivo no está disponible o la entrega está bloqueada. No se muestra como importado."
        : "Solo hay un registro de trabajo; todavía no existe un archivo listo para mostrar."}</p>
    </div>}
    <figcaption className={styles.meta}>
      <strong>{asset.alt || asset.id}</strong>
      <span>Origen: {asset.jobRef ?? "sin job registrado"}</span>
      <span>SHA-256 registrado: {asset.sha256 ? `${asset.sha256.slice(0, 12)}…` : "no disponible"}</span>
      {available ? <span>Archivo disponible en la biblioteca. Publicación externa no verificada.</span> : null}
    </figcaption>
  </figure>;
}
