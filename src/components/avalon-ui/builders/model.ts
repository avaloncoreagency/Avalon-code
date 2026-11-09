import { emptyBlock, emptyBlueprint, validateBlocks, validateBlueprint, cleanText } from '../../../lib/os/domain';
import type { BuilderContent, BuilderDraft, BuilderKind, BuilderTemplate, Project, ValidationResult } from './contracts';
export const templates:readonly BuilderTemplate[]=[
 {id:'website-blank',name:'Website · Blank',content:{kind:'website',pages:[{id:'home',title:'Home',blocks:[]}]}},
 {id:'website-intro',name:'Website · Introduction',content:{kind:'website',pages:[{id:'home',title:'Home',blocks:[emptyBlock('hero'),emptyBlock('text')]}]}},
 {id:'chatbot-blank',name:'Chatbot · Blank',content:{kind:'chatbot',config:{description:'',instructions:'',personality:'',greeting:'',color:'#8edbff',knowledge:[]}}},
 {id:'crm-blank',name:'CRM · Blank',content:{kind:'crm',blueprint:emptyBlueprint(),color:'#8edbff',modules:['contacts']}}
];
export const copy = <T,>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
export function createDraft(kind:BuilderKind,id:string):BuilderDraft {return {id,name:'',content:copy(templates.find(t=>t.content.kind===kind)!.content),status:'draft',demo:false,assets:[]};}
export function validateDraft(draft:BuilderDraft):ValidationResult {
 const errors:string[]=[]; if(!cleanText(draft.name,{min:1,max:120}).ok)errors.push('name');
 const c=draft.content;
 if(c.kind==='website'){
  if(!c.pages.length || c.pages.length>30 || new Set(c.pages.map(p=>p.id)).size!==c.pages.length)errors.push('pages');
  for(const p of c.pages)if(!cleanText(p.title,{min:1,max:120}).ok || !validateBlocks(p.blocks).ok)errors.push('page');
 }else if(c.kind==='chatbot'){
  if(!/^#[0-9a-f]{6}$/i.test(c.config.color))errors.push('color');
  for(const [key,max] of [['description',2000],['instructions',12000],['personality',500],['greeting',1000]] as const)if(!cleanText(c.config[key],{max}).ok)errors.push(key);
  if(c.config.knowledge.length>100 || new Set(c.config.knowledge.map(k=>k.id)).size!==c.config.knowledge.length)errors.push('knowledge');
  for(const k of c.config.knowledge)if(!cleanText(k.title,{min:1,max:120}).ok || !cleanText(k.body,{min:1,max:10000}).ok)errors.push('knowledge');
 }else{
  if(!validateBlueprint(c.blueprint).ok)errors.push('blueprint');
  if(!/^#[0-9a-f]{6}$/i.test(c.color))errors.push('color');
 }
 return errors.length?{ok:false,errors:[...new Set(errors)]}:{ok:true};
}
export type BuilderAction = {type:'edit'; name?:string; content?:BuilderContent} | {type:'template';template:BuilderTemplate} | {type:'save';id:string;at:string} | {type:'restore';id:string};
/** Reducer is local-only. Save adds an immutable snapshot; no remote state is claimed. */
export function projectReducer(project:Project,action:BuilderAction):Project {
 if(action.type==='edit')return {...project,draft:{...project.draft,...(action.name!==undefined?{name:action.name}:{}),...(action.content && action.content.kind===project.draft.content.kind?{content:copy(action.content)}:{}),status:'draft'}};
 if(action.type==='template')return action.template.content.kind===project.draft.content.kind?{...project,draft:{...project.draft,content:copy(action.template.content),status:'draft'}}:project;
 if(action.type==='restore'){const version=project.versions.find(v=>v.id===action.id);return version?{...project,draft:{...copy(version.draft),status:'draft'}}:project;}
 if(!validateDraft(project.draft).ok || project.versions.some(v=>v.id===action.id) || !Number.isFinite(Date.parse(action.at)))return project;
 const draft:BuilderDraft={...project.draft,status:'local-saved'};
 return {draft,versions:[{id:action.id,savedAt:action.at,draft:copy(draft)},...project.versions].slice(0,30)};
}
