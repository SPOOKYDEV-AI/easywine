
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {HttpError} from './validation.js';

const assets={
  '/':['index.html','text/html; charset=utf-8'],
  '/app.js':['app.js','text/javascript; charset=utf-8'],
  '/ui.js':['ui.js','text/javascript; charset=utf-8'],
  '/service.js':['service.js','text/javascript; charset=utf-8'],
  '/stats.js':['stats.js','text/javascript; charset=utf-8'],
  '/admin.js':['admin.js','text/javascript; charset=utf-8'],
  '/account.js':['account.js','text/javascript; charset=utf-8'],
  '/navigation.js':['navigation.js','text/javascript; charset=utf-8'],
  '/network-status.js':['network-status.js','text/javascript; charset=utf-8'],
  '/styles.css':['styles.css','text/css; charset=utf-8'],
  '/favicon.svg':['favicon.svg','image/svg+xml'],
  '/manifest.webmanifest':['manifest.webmanifest','application/manifest+json; charset=utf-8'],
  '/icon-192.png':['icon-192.png','image/png'],
  '/icon-512.png':['icon-512.png','image/png'],
  '/icon-180.png':['icon-180.png','image/png'],
  '/icon-maskable-512.png':['icon-maskable-512.png','image/png']
};
export const headers={
 'X-Content-Type-Options':'nosniff',
 'X-Frame-Options':'DENY',
 'Referrer-Policy':'no-referrer',
 'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
 'Cache-Control':'no-store',
 'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; font-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
};
export function json(res,status,data,extra={}){
 res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8',...extra});
 res.end(JSON.stringify(data));
}
// Public bundles contain no user data. Cache their bytes in memory and
// let browsers revalidate a versioned ETag rather than re-download each visit.
// Private API responses retain Cache-Control: no-store.
const staticAssets=new Map(Object.entries(assets).map(([url,[filename,type]])=>{
 const data=readFileSync(new URL('../../public/'+filename,import.meta.url));
 const etag='"'+createHash('sha256').update(data).digest('base64url')+'"';
 return [url,{type,data,etag}];
}));
export function staticFile(path,res,req){
 const asset=staticAssets.get(path);
 if(!asset)return false;
 const common={...headers,'Cache-Control':'public, max-age=0, must-revalidate',
   ETag:asset.etag,'Content-Type':asset.type};
 if(req?.headers['if-none-match']===asset.etag){
  res.writeHead(304,common);res.end();return true;
 }
 res.writeHead(200,common);
 res.end(asset.data);
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
