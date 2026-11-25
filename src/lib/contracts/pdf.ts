import { agreementLines, type AgreementSnapshot } from "./agreement";
// Same palette as src/lib/quotes/pdf.ts (#340). Integrity of an agreement is its snapshot sha256, not the PDF bytes.
const PAPER = "0.992 0.985 0.973", SAND = "0.965 0.938 0.894", INK = "0.165 0.157 0.153", BODY = "0.24 0.226 0.214";
const MUTED = "0.422 0.408 0.388", ACCENT = "0.678 0.502 0.318", RULE = "0.873 0.851 0.814";

/** Dependency-free, server-side PDF for immutable, owner-scoped contract snapshots. */
export function renderAgreementPdf(snapshot: AgreementSnapshot, id: string): Uint8Array {
  const input = snapshot.data;
  const W = 612, H = 792, margin = 48, leading = 13;
  type Draw = { x:number; y:number; text:string; font:"F1"|"F2"; size:number; color:string };
  const pages: Draw[][] = [[]];
  let y = H - 64;
  const current = () => pages[pages.length-1];
  const clean = (s: string) => s.normalize("NFC").replace(/[\u2010-\u2015]/g,"-").replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/\u2026/g,"...").replace(/\u2022/g,"-").replace(/[^\x20-\x7e\xa0-\xff\r\n\t]/g,"?");
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
  // Editorial cover: intentionally separate from the signed legal terms.
  const cover=pages[0];
  const coverText=(x:number,y0:number,text:string,font:"F1"|"F2",size:number,color:string)=>{
    cover.push({x,y:y0,text:clean(text),font,size,color});
  };
  coverText(48,680,"AVALON","F2",42,INK);
  coverText(50,652,"CORE AGENCY / PRIVATE SERVICES","F2",11,ACCENT);
  coverText(48,575,"MASTER SERVICES","F2",24,INK);
  coverText(48,544,"AGREEMENT","F2",24,INK);
  coverText(49,480,"PREPARED FOR","F2",9,ACCENT);
  for(const [i,s] of wrap(input.clientName,55).slice(0,2).entries())
    coverText(49,453-i*20,s,"F2",16,INK);
  coverText(49,372,"AGENCY","F2",9,ACCENT);
  for(const [i,s] of wrap(input.agencyName,60).slice(0,2).entries())
    coverText(49,349-i*17,s,"F1",11,INK);
  coverText(49,308,"EFFECTIVE DATE","F2",9,ACCENT);
  coverText(49,287,input.effectiveDate,"F1",11,INK);
  coverText(49,225,"VERSION "+id.toUpperCase().slice(0,8)+" / "+input.county+" COUNTY, FLORIDA","F1",9,MUTED);
  coverText(49,139,"DRAFT FOR FLORIDA COUNSEL REVIEW","F2",10,"0.62 0.25 0.34");
  coverText(49,119,"NOT SIGNED. GENERATION IS NOT ACCEPTANCE.","F1",9,"0.62 0.25 0.34");
  pages.push([]);
  y=H-64;
  for(const entry of agreementLines(snapshot,id)){
    const heading = clean(entry.heading);
    const lines=wrap(entry.text,94);
    next((heading?20:0)+Math.min(lines.length,2)*leading+10);
    if(heading){line(heading,"F2",10.5,INK);y-=4;}
    for(const s of lines)line(s,"F1",9.3,BODY);
    y-=10;
  }
  const objects:string[]=[];
  const add=(s:string)=>{objects.push(s);return objects.length;};
  const catalog=add(""); const pagesRoot=add("");
  const fontRegular=add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const fontBold=add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const pageIds:number[]=[];
  const esc=(s:string)=>s.replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)");
  for(let i=0;i<pages.length;i++){
    // Ivory editorial identity shared with quotes (#340) and manuals (#351): ivory paper, sand band, copper rules.
    const cmds=["q",PAPER+" rg","0 0 "+W+" "+H+" re f","Q","q",SAND+" rg","0 770 612 22 re f","Q","BT","/F2 9 Tf",INK+" rg","48 777 Td","(AVALON  /  CORE AGENCY) Tj","ET"];
    if(i===0)cmds.push("q",ACCENT+" rg","48 523 516 3 re f","Q","q",RULE+" rg","48 192 516 1 re f","Q");
    for(const d of pages[i]){
      cmds.push("BT",d.color+" rg","/"+d.font+" "+d.size+" Tf","1 0 0 1 "+d.x+" "+d.y+" Tm","("+esc(d.text)+") Tj","ET");
    }
    cmds.push("BT",MUTED+" rg","/F1 8 Tf","1 0 0 1 48 30 Tm","("+esc("ATTORNEY REVIEW DRAFT | NOT SIGNED | Page "+(i+1)+" of "+pages.length)+") Tj","ET");
    const stream=cmds.join("\n")+"\n";
    const bytes=Buffer.byteLength(stream,"latin1");
    const content=add("<< /Length "+bytes+" >>\nstream\n"+stream+"endstream");
    const page=add("<< /Type /Page /Parent "+pagesRoot+" 0 R /MediaBox [0 0 "+W+" "+H+"] /Resources << /Font << /F1 "+fontRegular+" 0 R /F2 "+fontBold+" 0 R >> >> /Contents "+content+" 0 R >>");
    pageIds.push(page);
  }
  objects[catalog-1]="<< /Type /Catalog /Pages "+pagesRoot+" 0 R >>";
  objects[pagesRoot-1]="<< /Type /Pages /Kids ["+pageIds.map(x=>x+" 0 R").join(" ")+"] /Count "+pageIds.length+" >>";
  let pdf="%PDF-1.4\n%AVALON\n";const offsets=[0];
  for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(pdf,"latin1"));pdf+=(i+1)+" 0 obj\n"+objects[i]+"\nendobj\n";}
  const xref=Buffer.byteLength(pdf,"latin1");
  pdf+="xref\n0 "+(objects.length+1)+"\n0000000000 65535 f \n";
  for(const offset of offsets.slice(1))pdf+=String(offset).padStart(10,"0")+" 00000 n \n";
  pdf+="trailer\n<< /Size "+(objects.length+1)+" /Root "+catalog+" 0 R >>\nstartxref\n"+xref+"\n%%EOF";
  return new Uint8Array(Buffer.from(pdf,"latin1"));
}
