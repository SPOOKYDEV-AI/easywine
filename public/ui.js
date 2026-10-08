
export const byId=id=>document.getElementById(id);
export const euro=cents=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(cents/100);
export function element(tag,props={},...children){
 const node=document.createElement(tag);
 for(const [key,value] of Object.entries(props)){
  if(key==='class')node.className=value;
  else if(key==='text')node.textContent=value;
  else if(key==='onClick')node.addEventListener('click',value);
  else if(key==='onChange')node.addEventListener('change',value);
  else if(key==='onInput')node.addEventListener('input',value);
  else if(key==='checked')node.checked=!!value;
  else if(key==='value')node.value=value;
  else if(key==='disabled')node.disabled=!!value;
  else node.setAttribute(key,value);
 }
 for(const child of children.flat(Infinity)){
  if(child===null||child===undefined||child===false)continue;
  node.append(child instanceof Node?child:document.createTextNode(String(child)));
 }
 return node;
}
export function clear(node,...children){node.replaceChildren(...children);}
export function heading(title,subtitle,action){
 const left=element('div',{},element('h1',{text:title}),element('p',{text:subtitle}));
 return element('div',{class:'page-header'},left,action||null);
}
export function empty(message){return element('div',{class:'empty',text:message});}
export function label(title,node){return element('label',{},title,node);}
export function input(name,value='',type='text',required=false){
 const e=element('input',{name,type,value:String(value??'')});
 e.required=required;return e;
}
export function select(name,options,selected){
 const s=element('select',{name});
 for(const [value,title] of options)s.append(element('option',{value,text:title}));
 if(selected!==undefined&&selected!==null)s.value=String(selected);
 return s;
}
let noticeTimer;
export function notice(message){
 const n=byId('notification');n.textContent=message;n.hidden=false;
 clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{n.hidden=true;},5200);
}
export async function request(method,path,data){
 const init={method,credentials:'same-origin',headers:{}};
 if(method!=='GET'){
  init.headers['Content-Type']='application/json';
  init.headers['X-EasyWine-Request']='1';
  init.body=JSON.stringify(data??{});
 }
 let response;
 try{response=await fetch(path,init);}
 catch{throw new Error('Connexion au serveur indisponible. Vérifiez le réseau local.');}
 let result;
 try{result=await response.json();}catch{throw new Error('Réponse serveur invalide.');}
 if(!response.ok){
  if(response.status===401&&
    !['/api/login','/api/login/mfa','/api/me/mfa/confirm','/api/me/mfa/disable'].includes(path))
   window.dispatchEvent(new Event('easywine:unauthorized'));
  throw new Error(result.error||'Erreur serveur '+response.status);
 }
 return result;
}
export function handle(fn){return async(...args)=>{try{await fn(...args);}catch(error){notice(error.message);}};}
export function field(grid,title,name,value,type='text',required=false){
 const control=input(name,value,type,required);
 grid.append(label(title,control));return control;
}
export function choiceField(grid,title,name,options,value){
 const control=select(name,options,value);grid.append(label(title,control));return control;
}
export const scale=[['1','1 · Très faible'],['2','2 · Faible'],['3','3 · Moyen'],['4','4 · Élevé'],['5','5 · Très élevé']];
