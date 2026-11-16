const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const ts=require("typescript");
const js=ts.transpileModule(fs.readFileSync("src/lib/ai-credits/higgsfield-usage.ts","utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const mod={exports:{}};
new Function("module","exports","require",js)(mod,mod.exports,(name)=>{
  if(name==="server-only")return {};
  throw Error("Unexpected import: "+name);
});
const read=mod.exports.readHiggsfieldOrganizationUsage;

test("Higgsfield backend requires a separately provisioned organization key",async()=>{
  const previous=process.env.HIGGSFIELD_ORG_KEY;
  delete process.env.HIGGSFIELD_ORG_KEY;
  try {assert.equal((await read()).status,"disconnected");}
  finally {if(previous===undefined)delete process.env.HIGGSFIELD_ORG_KEY;
    else process.env.HIGGSFIELD_ORG_KEY=previous;}
});

test("Higgsfield read-only usage report paginates, deduplicates and does not invent balances",async()=>{
  const priorKey=process.env.HIGGSFIELD_ORG_KEY,priorFetch=global.fetch;
  process.env.HIGGSFIELD_ORG_KEY="synthetic-secret";
  const urls=[];
  const gen={id:"a",type:"generation",credits:"12.50",actor:{user_id:"member_1",name:"Workspace member"}};
  let call=0;
  global.fetch=async(url,options)=>{
    urls.push(String(url));
    assert.equal(options.headers["x-api-key"],"synthetic-secret");
    assert.equal(options.cache,"no-store");
    call++;
    return {ok:true,json:async()=>call===1
      ? {data:[gen],has_more:true,next_page:"opaque",generated_at:"2026-11-16T08:00:00Z"}
      : {data:[gen,{id:"b",type:"charge",credits:"1.25",actor:{user_id:"member_1",name:"Workspace member"}}],
         has_more:false,next_page:null,generated_at:"2026-11-16T08:02:00Z"}
    };
  };
  try {
    const result=await read(new Date("2026-11-16T13:00:00Z"));
    assert.equal(result.status,"connected");
    assert.equal(result.spentCredits,13.75);
    assert.equal(result.generations,1);
    assert.equal(result.members.length,1);
    assert.equal(result.members[0].spentCredits,13.75);
    assert.equal(urls.length,2);
    assert.match(urls[0],/organization\/generation_usage_report/);
    assert.match(urls[1],/page=opaque/);
    assert.doesNotMatch(JSON.stringify(result),/synthetic-secret/);
    assert.equal(Object.hasOwn(result,"credits_available"),false);
  } finally {
    global.fetch=priorFetch;
    if(priorKey===undefined)delete process.env.HIGGSFIELD_ORG_KEY;
    else process.env.HIGGSFIELD_ORG_KEY=priorKey;
  }
});

test("Higgsfield permission failure has an explicit disconnected state, not zero credits",async()=>{
  const before=process.env.HIGGSFIELD_ORG_KEY,originalFetch=global.fetch;
  process.env.HIGGSFIELD_ORG_KEY="synthetic-secret";
  global.fetch=async()=>({ok:false,status:403});
  try {
    const result=await read(new Date("2026-11-16T13:00:00Z"));
    assert.equal(result.status,"unavailable");
    assert.equal(Object.hasOwn(result,"spentCredits"),false);
  }finally{
    global.fetch=originalFetch;
    if(before===undefined)delete process.env.HIGGSFIELD_ORG_KEY;
    else process.env.HIGGSFIELD_ORG_KEY=before;
  }
});
