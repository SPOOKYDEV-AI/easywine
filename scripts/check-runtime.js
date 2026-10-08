// Portable, shell-quoting-free runtime preflight for Windows and Linux.
const [major,minor,patch]=process.versions.node.split('.').map(Number);
const ok=major>22||(major===22&&minor>=16);
if(!ok){
 console.error('EasyWine requires Node.js >=22.16.0; current: '+process.version);
 process.exitCode=1;
}else{
 console.log('EasyWine runtime OK: Node.js '+process.version+' ('+process.platform+'/'+process.arch+')');
}
