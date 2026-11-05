import Image from 'next/image';
import type {Asset} from '@/lib/creative-bridge/continuity';
import {pick, type Lang} from '@/lib/i18n';
import {safeCreativeMediaPath, safeReducedMotionImage} from './media-safety';
import styles from './media.module.css';

/** No remote/signed media links, unsupported formats or unvalidated reduced-motion posters. */
export function CreativeAsset({asset,assets,lang}:{asset:Asset;assets:Asset[];lang:Lang}){
 const path=safeCreativeMediaPath(asset);
 if(!path)return <p>{asset.id}: {pick(lang,
  asset.state === 'ready' ? 'Vista previa no disponible: ruta o formato no admitido' : 'Recurso no incorporado',
  asset.state === 'ready' ? 'Preview unavailable: unsupported path or format' : 'Resource not imported'
 )}</p>;
 if(asset.kind==='image')return <Image src={path} alt={asset.alt} width={1400} height={900} sizes="(max-width: 700px) 100vw, 800px" style={{width:'100%',height:'auto',maxWidth:800}}/>;
 const fallback=safeReducedMotionImage(asset,assets);
 if(!fallback)return <p>{pick(lang,'Video sin alternativa segura para movimiento reducido. No se carga.','Video has no safe reduced-motion alternative. Not loaded.')}</p>;
 const poster=safeCreativeMediaPath(fallback);
 if(!poster)return null;
 return <div><video className={styles.motion} src={path} controls preload="none" playsInline poster={poster} aria-label={asset.alt} style={{maxWidth:'100%',width:800}}/><div className={styles.still}><Image src={poster} alt={asset.alt} width={1400} height={900} sizes="100vw" style={{maxWidth:'100%',height:'auto'}}/></div></div>;
}
