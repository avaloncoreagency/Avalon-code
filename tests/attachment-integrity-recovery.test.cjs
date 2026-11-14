const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('../scripts/creative-bridge/continuity-loader.cjs');
const {attachmentMime,decodeBytea}=load('src/lib/crm/attachments.ts');
const {writeZip}=load('src/lib/project-bridge/zip-write.ts');
const bytes=s=>new TextEncoder().encode(s);
function office(kind,extra=[]){
 const main=kind==='docx'?'word/document.xml':'xl/workbook.xml';
 const type=kind==='docx'?'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml';
 const archive=Buffer.from(writeZip([{path:'xContent_Typesx.xml',bytes:bytes(`<Types><Override PartName="/${main}" ContentType="${type}"/></Types>`)},{path:'_rels/.rels',bytes:bytes('<Relationships/>')},{path:main,bytes:bytes('<document/>')},...extra]));
 let at=0;while((at=archive.indexOf('xContent_Typesx.xml',at))>=0){archive.write('[Content_Types].xml',at);at+=18;}
 return archive;
}
test('a WAV/RIFF file renamed to webp and a truncated PNG signature are rejected',()=>{
 assert.equal(attachmentMime('audio.webp',bytes('RIFF0000WAVEpayload')),null);
 assert.equal(attachmentMime('truncated.png',new Uint8Array([137,80,78,71,1])),null);
 assert.equal(attachmentMime('image.webp',bytes('RIFF0000WEBPVP8 payload')),'image/webp');
});
test('Office attachments require a bounded valid OOXML archive of the right kind',()=>{
 assert.equal(attachmentMime('fake.docx',bytes('PK\x03\x04')),null);
 assert.equal(attachmentMime('wrong.xlsx',office('docx')),null);
 assert.equal(attachmentMime('safe.docx',office('docx')),'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
 assert.equal(attachmentMime('safe.xlsx',office('xlsx')),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
});
test('Office archives reject macros, embedded executables and unsafe paths',()=>{
 for(const path of ['word/vbaProject.bin','word/embeddings/oleObject1.bin'])
  assert.equal(attachmentMime('unsafe.docx',office('docx',[{path,bytes:bytes('synthetic')}])) ,null,path);
 const malicious=Buffer.from(office('docx',[{path:'aa/outside.xml',bytes:bytes('synthetic')}]));
 let offset=0;while((offset=malicious.indexOf('aa/outside.xml',offset))>=0){malicious.write('../outside.xml',offset);offset+=14;}
 assert.equal(attachmentMime('unsafe.docx',malicious),null);
});
test('malformed hex and non-byte objects never silently decode to partial or altered data',()=>{
 for(const value of ['\\x6162zz','\\x616','6162z',{0:256},{0:-1},{0:1.5},{0:1,2:2},{foo:65}])
  assert.equal(decodeBytea(value).length,0,JSON.stringify(value));
 assert.equal(decodeBytea('\\x6869').toString(),'hi');
 assert.equal(decodeBytea({0:104,1:105}).toString(),'hi');
});
