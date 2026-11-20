import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {packageProfileRecovery} from '../scripts/package-profile-recovery.mjs';
function fixture(t,{support=true,privateFile=false,privateName='synthetic.sqlite'}={}){
 const root=mkdtempSync(join(tmpdir(),'skaz-recovery-package-test-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const repo=join(root,'repo');mkdirSync(repo);mkdirSync(join(repo,'server'));
 for(const name of ['startup','index','app'])writeFileSync(join(repo,'server',name+'.mjs'),support?(name==='app'?'// data-profile-editors':'// SKAZ_PROFILE_EDITORS'):'// old version');
 if(privateFile)writeFileSync(join(repo,privateName),'synthetic placeholder');
 const git=args=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();
 git(['init','-q']);git(['add','.']);git(['-c','user.name=Synthetic QA','-c','user.email=synthetic@example.invalid','commit','-qm','Synthetic fixture']);
 const commit=git(['rev-parse','HEAD']);writeFileSync(join(repo,'untracked.sqlite'),'synthetic untracked placeholder');
 return {repository:repo,commit,directory:join(root,'candidate'),root};
}
test('recovery package pins an immutable Git tree, ignores untracked files and records only nonsecret recovery configuration',async t=>{
 const input=fixture(t),result=await packageProfileRecovery(input),bytes=readFileSync(join(input.directory,'source.tar.gz'));
 assert.equal(result.sha256,createHash('sha256').update(bytes).digest('hex'));assert.equal(result.sourceCommit,input.commit);
 assert.deepEqual(result.requiredEnvironment,{SKAZ_PROFILE_EDITORS:'0'});assert.equal(result.releaseApproved,false);assert.equal(result.compatibilityVerified,false);
 const names=execFileSync('tar',['-tzf',join(input.directory,'source.tar.gz')],{encoding:'utf8'});assert.match(names,/server\/app.mjs/);assert.doesNotMatch(names,/sqlite/);
 assert.equal(JSON.parse(readFileSync(join(input.directory,'candidate.json'),'utf8')).sha256,result.sha256);
});
test('recovery packaging refuses mutable refs, an old reader and output inside its checkout',async t=>{
 const input=fixture(t);await assert.rejects(packageProfileRecovery({...input,commit:'HEAD'}),/full commit SHA/);
 await assert.rejects(packageProfileRecovery({...input,directory:join(input.repository,'candidate')}),/outside/);
 const old=fixture(t,{support:false});await assert.rejects(packageProfileRecovery(old),/lacks profile recovery/);assert.equal(existsSync(old.directory),false);
});
test('recovery packaging never overwrites an existing candidate directory',async t=>{
 const input=fixture(t);mkdirSync(input.directory);const sentinel=join(input.directory,'keep.txt');writeFileSync(sentinel,'unchanged');
 await assert.rejects(packageProfileRecovery(input),{code:'EEXIST'});assert.equal(readFileSync(sentinel,'utf8'),'unchanged');assert.equal(existsSync(join(input.directory,'source.tar.gz')),false);
});
test('tracked private file types fail before creating a release directory',async t=>{
 for(const privateName of ['synthetic.sqlite','синтетика.sqlite','.env.local']){const input=fixture(t,{privateFile:true,privateName});await assert.rejects(packageProfileRecovery(input),/private file types/);assert.equal(existsSync(input.directory),false);}
});
