import Image from 'next/image';
import type {Asset} from '@/lib/creative-bridge/continuity';
import styles from './media.module.css';
export function CreativeAsset({asset,assets}:{asset:Asset;assets:Asset[]}){
 if(asset.state!=='ready'||!asset.public_path)return <p>{asset.id}: {asset.state} · recurso no incorporado</p>;
 if(asset.kind==='image')return <Image src={asset.public_path} alt={asset.alt} width={1400} height={900} sizes="(max-width: 700px) 100vw, 800px" style={{width:'100%',height:'auto',maxWidth:800}}/>;
 const fallback=assets.find(a=>a.kind==='image'&&a.state==='ready'&&a.storage_ref===asset.reduced_motion_ref&&a.public_path);
 if(!fallback)return <p>Video sin alternativa aprobada. No se carga.</p>;
 return <div><video className={styles.motion} src={asset.public_path} controls preload="none" playsInline poster={fallback.public_path} aria-label={asset.alt} style={{maxWidth:'100%',width:800}}/><div className={styles.still}><Image src={fallback.public_path!} alt={asset.alt} width={1400} height={900} sizes="100vw" style={{maxWidth:'100%',height:'auto'}}/></div></div>;
}
