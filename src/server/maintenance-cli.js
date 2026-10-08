
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openDatabase} from './db.js';
import {createBackup,restoreToNewPath} from './maintenance.js';
import {pruneServiceHistory} from './service-history.js';

export async function main(args=process.argv.slice(2)){
  const [command,...options]=args;
  const option=flag=>{const i=options.indexOf(flag);return i<0?null:options[i+1];};
  if(command==='backup'){
    const directory=option('--directory');
    if(!directory)throw Error('Usage: npm run backup -- backup --directory /private/backups');
    const database=openDatabase();
    try{
      const result=await createBackup(database,resolve(directory));
      console.log('Backup vérifié : '+result.name+' ('+result.pages+' pages, '+result.restaurants+' restaurants)');
    }finally{database.close();}
  }else if(command==='restore'){
    const source=option('--from'),target=option('--to');
    if(!source||!target)throw Error('Usage: npm run backup -- restore --from /private/backup.sqlite --to /private/recovered.sqlite');
    // The application must be stopped and configured to use the NEW file
    // after this completes; never overwrite the live database.
    const result=restoreToNewPath(source,target);
    console.log('Restauration vérifiée vers : '+result.path);
    console.log('Configurer EASYWINE_DB sur ce nouveau fichier avant de redémarrer EasyWine.');
  }else if(command==='prune-service-history'){
    const days=Number(option('--days'));
    if(!Number.isSafeInteger(days)||days<1||days>3650)
      throw Error('Usage: npm run backup -- prune-service-history --days 180');
    const db=openDatabase();
    try{
      const before=new Date(Date.now()-days*24*60*60*1000);
      const count=pruneServiceHistory(db,before);
      console.log('Sessions de service supprimées : '+count+'.');
    }finally{db.close();}
  }else throw Error('Usage: npm run backup -- backup --directory PATH | restore --from FILE --to NEW_FILE | prune-service-history --days N');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  process.umask(0o077);
  main().catch(error=>{console.error('Maintenance échouée : '+error.message);process.exitCode=1;});
}
