'use client';
import {useState} from 'react';
import {ProductBuilder} from './product-builders';
import type {BuilderKind} from './contracts';
export default function BuildersDemo(){const [kind,setKind]=useState<BuilderKind>('website');return <main><p>DEMO · Local configuration only · No backend</p><nav aria-label="DEMO products">{(['website','chatbot','crm'] as const).map(k=><button style={{minHeight:44}} key={k} onClick={()=>setKind(k)}>{k}</button>)}</nav><ProductBuilder key={kind} kind={kind} lang="es"/></main>;}
