'use strict';
// Static review tripwire, not authentication, a provenance verifier or a whole-program security scanner.
const path=require('node:path'),ts=require('typescript');
const PLANNER='src/lib/operations/mission-plan.ts',TEMPLATES='src/lib/operations/department-templates.ts';
const normalize=p=>p.replace(/\\/g,'/');
function target(file,specifier){
 let p;if(specifier.startsWith('@/'))p='src/'+specifier.slice(2);else if(specifier.startsWith('.'))p=path.posix.join(path.posix.dirname(normalize(file)),specifier);else if(specifier.startsWith('src/'))p=specifier;else return null;
 return path.posix.normalize(p).replace(/\.[cm]?[jt]sx?$/i,'').replace(/\/index$/,'');
}
function inspectImports(fileName,source){
 const name=normalize(fileName),controlled=[PLANNER,TEMPLATES].includes(name),errors=[];
 const file=ts.createSourceFile(fileName,source,ts.ScriptTarget.Latest,true,/\.tsx$/.test(name)?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 function check(specifier,node,kind){
  const resolved=target(name,specifier),draft=resolved==='src/lib/operations'||resolved?.startsWith('src/lib/operations/');
  // One reviewed declaration-only edge. No wildcards, reexports, calls or arbitrary symbols are exempt.
  const clause=ts.isImportDeclaration(node)?node.importClause:null;
  const bindings=clause?.namedBindings;
  const symbols=bindings&&ts.isNamedImports(bindings)?bindings.elements.map(e=>(e.propertyName??e.name).text):[];
  const internal=name===TEMPLATES&&resolved===PLANNER.slice(0,-3)&&kind==='import'&&!clause?.name&&symbols.length>0&&symbols.every(s=>['DEPARTMENTS','Department','MissionTask'].includes(s));
  if(draft&&!internal)errors.push('draft_consumer:'+specifier);
  if(controlled){
   const purePolicy=name===PLANNER&&kind==='import'&&(specifier==='node:crypto'||resolved==='src/lib/agents/policy');
   if(!internal&&!purePolicy)errors.push('unreviewed_planning_dependency:'+specifier);
  }
 }
 function visit(node){
  if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteralLike(node.moduleSpecifier))check(node.moduleSpecifier.text,node,ts.isImportDeclaration(node)?'import':'export');
  if(ts.isImportEqualsDeclaration(node)&&ts.isExternalModuleReference(node.moduleReference)&&node.moduleReference.expression&&ts.isStringLiteralLike(node.moduleReference.expression))check(node.moduleReference.expression.text,node,'require');
  if(ts.isCallExpression(node)){
   const moduleCall=node.expression.kind===ts.SyntaxKind.ImportKeyword||(ts.isIdentifier(node.expression)&&node.expression.text==='require');
   if(moduleCall){if(node.arguments[0]&&ts.isStringLiteralLike(node.arguments[0]))check(node.arguments[0].text,node,'call');else if(controlled)errors.push('computed_planning_dependency');}
   if(controlled&&ts.isIdentifier(node.expression)&&['fetch','eval','Function','WebSocket','XMLHttpRequest'].includes(node.expression.text))errors.push('planning_side_effect:'+node.expression.text);
   if(controlled&&ts.isPropertyAccessExpression(node.expression)&&['rpc','query','exec','spawn','fetch','writeFileSync','unlinkSync'].includes(node.expression.name.text))errors.push('planning_side_effect:'+node.expression.name.text);
  }
  if(controlled&&ts.isNewExpression(node)&&ts.isIdentifier(node.expression)&&['Function','WebSocket','XMLHttpRequest'].includes(node.expression.text))errors.push('planning_side_effect:'+node.expression.text);
  if(controlled&&ts.isPropertyAccessExpression(node)&&node.getText(file)==='process.env')errors.push('planning_environment_access');
  ts.forEachChild(node,visit);
 }
 visit(file);return errors;
}
module.exports={inspectImports,PLANNER,TEMPLATES};
