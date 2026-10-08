
import {openDatabase,transaction,id,now} from './db.js';
import {createUser} from './auth.js';
import {text} from './validation.js';
import {pathToFileURL} from 'node:url';

function arg(name){const index=process.argv.indexOf(name);return index<0?null:process.argv[index+1];}
export function bootstrap(db,{slug,name,email,owner,password}){
 if(!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug))throw Error('Slug invalide');
 if(!/^\S+@\S+\.\S+$/.test(email))throw Error('Adresse e-mail invalide');
 name=text(name,'Restaurant',160);owner=text(owner,'Responsable',120);
 const restaurantId=id();
 return transaction(db,()=>{
  db.prepare('INSERT INTO restaurants(id,slug,name,created_at) VALUES(?,?,?,?)')
    .run(restaurantId,slug,name,now());
  const userId=createUser(db,{restaurantId,name:owner,email,role:'owner',password});
  return {restaurantId,userId,slug};
 });
}
async function main(){
 const slug=arg('--slug'),name=arg('--name'),email=arg('--email'),owner=arg('--owner');
 const password=process.env.EASYWINE_BOOTSTRAP_PASSWORD;
 if(!slug||!name||!email||!owner||!password){
  console.error('Usage: EASYWINE_BOOTSTRAP_PASSWORD=<secret> npm run bootstrap -- --slug maison --name "Maison" --email owner@example.com --owner "Responsable"');
  process.exitCode=1;return;
 }
 const db=openDatabase();
 try{
  const result=bootstrap(db,{slug,name,email,owner,password});
  console.log('Restaurant créé : '+result.slug+' ('+result.restaurantId+')');
 }finally{db.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(error=>{console.error(error.message);process.exitCode=1;});
