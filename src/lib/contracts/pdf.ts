import { agreementLines, type AgreementData } from "./agreement";

/** Dependency-free, server-side PDF for immutable, owner-scoped contract snapshots. */
export function renderAgreementPdf(input: AgreementData, id: string): Uint8Array {
  const W = 612, H = 792, margin = 48, leading = 13;
  type Draw = { x:number; y:number; text:string; font:"F1"|"F2"; size:number; color:string };
  const pages: Draw[][] = [[]];
  let y = H - 64;
  const current = () => pages[pages.length-1];
  const clean = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[\u2010-\u2015]/g,"-").replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/[^\x20-\x7e]/g,"?");
  const wrap = (s: string,max:number):string[] => {
    const out:string[]=[];
    for(const paragraph of clean(s).split(/\r?\n/)) {
      const words = paragraph.split(/\s+/);let line="";
      for(let word of words) {
        while(word.length>max) {if(line){out.push(line);line="";}out.push(word.slice(0,max));word=word.slice(max);}
        if(!word)continue;
        if(line && (line.length+1+word.length)>max){out.push(line);line=word;}else line+=(line?" ":"")+word;
      }
      out.push(line);
    }
    return out;
  };
  const next = (need:number) => {if(y-need < 62){pages.push([]);y=H-64;}};
  const line = (text:string,font:"F1"|"F2",size:number,color:string, x=margin) => {
    next(leading);current().push({x,y,text,font,size,color});y-=leading;
  };
  for(const entry of agreementLines(input,id)){
    const heading = clean(entry.heading);
    const lines=wrap(entry.text,94);
    next((heading?20:0)+Math.min(lines.length,2)*leading+10);
    if(heading){line(heading,"F2",10.5,"0.16 0.24 0.49");y-=4;}
    for(const s of lines)line(s,"F1",9.3,"0.16 0.21 0.32");
    y-=10;
  }
  const objects:string[]=[];
  const add=(s:string)=>{objects.push(s);return objects.length;};
  const catalog=add(""); const pagesRoot=add("");
  const fontRegular=add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const fontBold=add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageIds:number[]=[];
  const esc=(s:string)=>s.replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)");
  for(let i=0;i<pages.length;i++){
    const cmds=["q","0.035 0.055 0.11 rg","0 770 612 22 re f","Q","BT","/F2 9 Tf","0.85 0.89 1 rg","48 777 Td","(AVALON  /  CORE AGENCY) Tj","ET"];
    for(const d of pages[i]){
      cmds.push("BT",d.color+" rg","/"+d.font+" "+d.size+" Tf","1 0 0 1 "+d.x+" "+d.y+" Tm","("+esc(d.text)+") Tj","ET");
    }
    cmds.push("BT","0.46 0.5 0.57 rg","/F1 8 Tf","1 0 0 1 48 30 Tm","("+esc("ATTORNEY REVIEW DRAFT | NOT SIGNED | Page "+(i+1)+" of "+pages.length)+") Tj","ET");
    const stream=cmds.join("\n")+"\n";
    const bytes=new TextEncoder().encode(stream).length;
    const content=add("<< /Length "+bytes+" >>\nstream\n"+stream+"endstream");
    const page=add("<< /Type /Page /Parent "+pagesRoot+" 0 R /MediaBox [0 0 "+W+" "+H+"] /Resources << /Font << /F1 "+fontRegular+" 0 R /F2 "+fontBold+" 0 R >> >> /Contents "+content+" 0 R >>");
    pageIds.push(page);
  }
  objects[catalog-1]="<< /Type /Catalog /Pages "+pagesRoot+" 0 R >>";
  objects[pagesRoot-1]="<< /Type /Pages /Kids ["+pageIds.map(x=>x+" 0 R").join(" ")+"] /Count "+pageIds.length+" >>";
  let pdf="%PDF-1.4\n%AVALON\n";const offsets=[0];
  for(let i=0;i<objects.length;i++){offsets.push(new TextEncoder().encode(pdf).length);pdf+=(i+1)+" 0 obj\n"+objects[i]+"\nendobj\n";}
  const xref=new TextEncoder().encode(pdf).length;
  pdf+="xref\n0 "+(objects.length+1)+"\n0000000000 65535 f \n";
  for(const offset of offsets.slice(1))pdf+=String(offset).padStart(10,"0")+" 00000 n \n";
  pdf+="trailer\n<< /Size "+(objects.length+1)+" /Root "+catalog+" 0 R >>\nstartxref\n"+xref+"\n%%EOF";
  return new TextEncoder().encode(pdf);
}
