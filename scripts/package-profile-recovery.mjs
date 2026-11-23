// Packages only an explicit immutable Git commit. Never reads a campaign database or runtime environment.
import {execFileSync} from 'node:child_process';
import {mkdir,realpath,writeFile,chmod} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join,sep,dirname,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
const git=(repository,args)=>execFileSync('git',args,{cwd:repository,encoding:'utf8',maxBuffer:8*1024*1024}).trim();
export async function packageProfileRecovery({repository,commit,directory}){
 if(typeof commit!=='string'||!/^([a-f0-9]{40})$/.test(commit))throw Error('An explicit full commit SHA is required');
 const root=await realpath(git(repository,['rev-parse','--show-toplevel']));
 if(git(root,['cat-file','-t',commit])!=='commit')throw Error('A commit is required');
 for(const [file,marker] of [['server/startup.mjs','SKAZ_PROFILE_EDITORS'],['server/index.mjs','SKAZ_PROFILE_EDITORS'],['server/app.mjs','data-profile-editors']]){
  if(!git(root,['show',commit+':'+file]).includes(marker))throw Error('Commit lacks profile recovery support');
 }
 const files=git(root,['ls-tree','-rz','--name-only',commit]).split('\0');
 if(files.some(name=>/(^|\/)(\.env(?:\.[^/]*)?|[^/]+\.(?:sqlite3?|db)(?:[.-].*)?|[^/]+\.(?:pem|key|p12|pfx|mp3|wav|m4a|aac|ogg|flac|opus))$/i.test(name)))throw Error('Commit contains prohibited private file types');
 const requested=resolve(directory),parent=await realpath(dirname(requested));
 const output=join(parent,basename(requested));
 const normalized=value=>process.platform==='win32'?value.toLowerCase():value;
 if(normalized(output)===normalized(root)||normalized(output).startsWith(normalized(root+sep)))throw Error('Output must be outside the checkout');
 await mkdir(output,{mode:0o700}); // Must be new: never overwrite an earlier release or caller files.
 const archive=join(output,'source.tar.gz');
 execFileSync('git',['archive','--format=tar.gz','--output='+archive,commit],{cwd:root,stdio:'pipe'});
 await chmod(archive,0o600);
 const hash=createHash('sha256');for await(const chunk of createReadStream(archive))hash.update(chunk);
 const manifest={app:'skaz-profile-recovery-candidate',schemaVersion:1,sourceCommit:commit,archive:'source.tar.gz',sha256:hash.digest('hex'),requiredEnvironment:{SKAZ_PROFILE_EDITORS:'0',SKAZ_PROFILE_WRITE_FORMAT:'15'},preserveExistingAuthentication:true,preserveExistingFeatureFlags:true,databasePolicy:'reuse-current-database-without-downgrade',compatibilityVerified:false,releaseApproved:false};
 await writeFile(join(output,'candidate.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
 return {directory:output,...manifest};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [commit,directory,...extra]=process.argv.slice(2);
 try{
  if(!directory||extra.length)throw Error('Usage: node scripts/package-profile-recovery.mjs full-commit-sha new-output-directory');
  const result=await packageProfileRecovery({repository:process.cwd(),commit,directory});console.log(JSON.stringify(result));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
