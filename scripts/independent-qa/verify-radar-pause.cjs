#!/usr/bin/env node
// Reuse the implementation owner's assertions on an EXACT checkout; never enable production Radar.
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const [rootArg,expected]=process.argv.slice(2);
if(!rootArg||!expected||!/^[a-f0-9]{40}$/.test(expected))throw Error('Usage: node scripts/independent-qa/verify-radar-pause.cjs /absolute/candidate/worktree FULL_SHA');
const cwd=path.resolve(rootArg);
const git=args=>{const r=spawnSync('git',args,{cwd,encoding:'utf8'});if(r.status!==0)throw Error('Cannot verify checkout');return r.stdout.trim()};
if(git(['rev-parse','HEAD'])!==expected)throw Error('SHA mismatch: refuse stale candidate evidence');
if(git(['status','--porcelain','--untracked-files=no']))throw Error('Tracked modifications: refuse exact-SHA claim');
const suite=path.join(cwd,'tests/radar-pause.test.cjs');
if(!fs.existsSync(suite))throw Error('NOT_READY: candidate has no suspension acceptance suite');
console.log('Testing Radar suspension on '+expected+' (synthetic; no deployed config changed)');
const result=spawnSync(process.execPath,['--test',suite],{cwd,stdio:'inherit',timeout:60000,env:{...process.env,AVALON_RADAR_EXTERNAL_ENABLED:'false',NEXT_TELEMETRY_DISABLED:'1'}});
if(result.error)throw result.error;
process.exitCode=result.status??1;
