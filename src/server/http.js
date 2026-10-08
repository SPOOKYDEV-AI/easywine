
import {readFileSync} from 'node:fs';
import {HttpError} from './validation.js';

const assets={
  '/':['index.html','text/html; charset=utf-8'],
  '/app.js':['app.js','text/javascript; charset=utf-8'],
  '/styles.css':['styles.css','text/css; charset=utf-8'],
  '/favicon.svg':['favicon.svg','image/svg+xml']
};
export const headers={
 'X-Content-Type-Options':'nosniff',
 'X-Frame-Options':'DENY',
 'Referrer-Policy':'no-referrer',
 'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
 'Cache-Control':'no-store',
 'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
};
export function json(res,status,data,extra={}){
 res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8',...extra});
 res.end(JSON.stringify(data));
}
export function staticFile(path,res){
 if(!Object.hasOwn(assets,path))return false;
 const [filename,type]=assets[path];
 const data=readFileSync(new URL('../../public/'+filename,import.meta.url));
 res.writeHead(200,{...headers,'Content-Type':type});
 res.end(data);
 return true;
}
export async function jsonBody(req){
 const type=(req.headers['content-type']||'').split(';')[0].trim().toLowerCase();
 if(type!=='application/json')throw new HttpError(415,'Requête JSON requise.');
 let length=0;const chunks=[];
 for await(const chunk of req){
   length+=chunk.length;
   if(length>131072)throw new HttpError(413,'Requête trop volumineuse.');
   chunks.push(chunk);
 }
 try{
   const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(data===null||typeof data!=='object'||Array.isArray(data))throw Error();
   return data;
 }catch{throw new HttpError(400,'JSON invalide.');}
}
