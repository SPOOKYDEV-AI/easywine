
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {openDatabase} from './db.js';
import {getUser} from './auth.js';
import {route} from './routes.js';
import {HttpError} from './validation.js';
import {json,jsonBody,staticFile} from './http.js';

export function createApp({db,origin=null,secure=false}={}){
 if(!db)throw new Error('Database required');
 return http.createServer(async(req,res)=>{
  try{
   const path=new URL(req.url,'http://localhost').pathname;
   if(req.method==='GET'&&path==='/healthz'){
    db.prepare('SELECT 1').get();json(res,200,{status:'ok'});return;
   }
   if(req.method==='GET'&&staticFile(path,res))return;
   if(!path.startsWith('/api/'))throw new HttpError(404,'Introuvable.');
   if(!['GET','POST','PATCH','PUT'].includes(req.method))throw new HttpError(405,'Méthode non autorisée.');
   if(req.method!=='GET'){
    const expected=origin||('http://'+req.headers.host);
    if(req.headers.origin&&req.headers.origin!==expected)throw new HttpError(403,'Origine non autorisée.');
    if(req.headers['x-easywine-request']!=='1')throw new HttpError(403,'En-tête anti-CSRF manquant.');
   }
   const body=req.method==='GET'?undefined:await jsonBody(req);
   const cookie=req.headers.cookie||'';
   const user=getUser(db,cookie);
   const result=await route({db,method:req.method,path,body,user,cookie,
     ip:req.socket.remoteAddress||'unknown',secure});
   json(res,result.status||200,result.body,result.headers);
  }catch(err){
   if(!(err instanceof HttpError))console.error('EasyWine request failed:',err);
   if(!res.headersSent)json(res,err instanceof HttpError?err.status:500,
     {error:err instanceof HttpError?err.message:'Erreur interne du serveur.'});
   else res.destroy();
  }
 });
}
export function start(){
 const production=process.env.NODE_ENV==='production';
 const origin=process.env.EASYWINE_ORIGIN||null;
 if(production&&(!origin||!origin.startsWith('https://')))
   throw new Error('EASYWINE_ORIGIN must specify the HTTPS application origin');
 const db=openDatabase();
 const server=createApp({db,origin,secure:production});
 server.requestTimeout=15000;server.headersTimeout=10000;
 const port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';
 server.listen(port,host,()=>console.log('EasyWine on '+host+':'+port));
 const stop=()=>server.close(()=>{db.close();process.exit(0);});
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
 return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)start();
