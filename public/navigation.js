export const knownViews=new Set(['service','wines','dishes','history','stats','users','account']);
export function viewFromHash(hash){
 const match=/^#\/([a-z]+)$/.exec(hash||'');
 return match&&knownViews.has(match[1])?match[1]:null;
}
export function writeViewLocation(view,{replace=false}={}){
 if(!knownViews.has(view))throw Error('Rubrique inconnue.');
 const hash='#/'+view;
 if(window.location.hash===hash)return false;
 window.history[replace?'replaceState':'pushState']({easywineView:view},'',hash);
 return true;
}
