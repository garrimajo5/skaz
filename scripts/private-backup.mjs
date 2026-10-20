import {DatabaseSync,backup} from 'node:sqlite';
import {stat,open,chmod,realpath} from 'node:fs/promises';
import path from 'node:path';
// Reserve a new destination before any schema migration or administrative write.
export async function privateDatabaseBackup(database,backupFile){
 if(![database,backupFile].every(v=>typeof v==='string'&&v))throw new Error('Нужны существующая база и новый путь копии');
 const source=await realpath(database),destination=path.resolve(backupFile);
 if(source===destination||!(await stat(source)).isFile())throw new Error('Нужна существующая база и отдельная копия');
 const reservation=await open(destination,'wx',0o600);await reservation.close();
 let connection;
 try{connection=new DatabaseSync(source,{readOnly:true});await backup(connection,destination);await chmod(destination,0o600);}finally{connection?.close();}
 return {source,destination};
}
