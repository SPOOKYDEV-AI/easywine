
import {element as e,heading,notice,request,handle,withBusy} from './ui.js';

function passwordPanel(onLogout){
 const panel=e('section',{class:'panel'});
 const form=e('form',{class:'form-card'});
 form.append(e('h2',{text:'Changer mon mot de passe'}),
   e('p',{class:'muted',text:'La modification révoquera toutes vos sessions, y compris celle-ci.'}));
 const current=e('input',{type:'password',name:'current',autocomplete:'current-password'});
 const next=e('input',{type:'password',name:'next',autocomplete:'new-password'});
 const confirm=e('input',{type:'password',name:'confirm',autocomplete:'new-password'});
 current.required=next.required=confirm.required=true;
 next.minLength=confirm.minLength=12;
 form.append(e('label',{},'Mot de passe actuel',current),
  e('label',{},'Nouveau mot de passe (12 caractères minimum)',next),
  e('label',{},'Confirmer le nouveau mot de passe',confirm),
  e('button',{type:'submit',class:'button primary',text:'Enregistrer et me déconnecter'}));
 form.addEventListener('submit',handle(async event=>{
  event.preventDefault();
  if(next.value!==confirm.value)throw Error('Les deux mots de passe ne correspondent pas.');
  await withBusy(form.querySelector('button[type=submit]'),async()=>{
   await request('POST','/api/me/password',{currentPassword:current.value,newPassword:next.value});
   onLogout();notice('Mot de passe modifié. Connectez-vous à nouveau.');
  },'Sécurisation du compte…');
 }));
 panel.append(form);
 return panel;
}
function setupMfa(panel,onLogout){
 panel.append(e('h2',{text:'Activer le second facteur'}),
   e('p',{class:'muted',text:'Utilisez une application TOTP compatible (dont Yubico Authenticator). Après activation, le mot de passe seul ne permettra plus de se connecter.'}));
 const form=e('form',{class:'form-card'});
 const password=e('input',{type:'password',autocomplete:'current-password',required:true});
 form.append(e('label',{},'Confirmez votre mot de passe actuel',password),
   e('button',{type:'submit',class:'button primary',text:'Commencer la configuration'}));
 panel.append(form);
 form.addEventListener('submit',handle(async event=>{
  event.preventDefault();
  const setup=await withBusy(form.querySelector('button[type=submit]'),
   ()=>request('POST','/api/me/mfa/setup',{password:password.value}),
   'Préparation du second facteur…');
  password.value='';
  form.hidden=true;
  const block=e('div',{class:'mfa-setup'},
    e('p',{text:'Enregistrez la clé dans votre application d’authentification :'}),
    e('code',{class:'secret-value',text:setup.secret}),
    e('a',{href:setup.uri,class:'subtle-button',text:'Ouvrir l’application d’authentification'}),
    e('p',{class:'hint',text:'Cette clé n’est affichée que pendant cette étape. Le code expire après 10 minutes.'}));
  const verify=e('form',{class:'form-card'});
  const code=e('input',{type:'text',name:'otp',inputmode:'numeric',autocomplete:'one-time-code',
    maxlength:'6',placeholder:'000000',required:true});
  verify.append(e('label',{},'Code à 6 chiffres',code),
   e('button',{type:'submit',class:'button primary',text:'Vérifier et activer'}));
  block.append(verify);panel.append(block);
  verify.addEventListener('submit',handle(async evt=>{
   evt.preventDefault();
   const result=await withBusy(verify.querySelector('button[type=submit]'),
    ()=>request('POST','/api/me/mfa/confirm',{code:code.value.trim()}),
    'Validation du code…');
   notice('Second facteur activé. Conservez vos codes de secours.');
   block.replaceChildren(
    e('h3',{text:'Conservez vos codes de secours'}),
    e('p',{class:'muted',text:'Ils sont affichés une seule fois et chacun est utilisable une seule fois. Ne les stockez pas avec votre mot de passe.'}),
    e('pre',{class:'recovery-codes',text:result.codes.join('\n')}),
    e('button',{type:'button',class:'button primary',
      text:'J’ai sauvegardé les codes · Me reconnecter',onClick:onLogout})
   );
  }));
 }));
}
function activeMfa(panel,state,onLogout){
 panel.append(e('h2',{text:'Second facteur actif'}),
  e('p',{class:'muted',text:'Votre compte demande un code d’authentification ou un code de secours en plus du mot de passe.'}),
  e('p',{class:'hint',text:state.recoveryCodesRemaining+' code(s) de secours restant(s).'}));
 const form=e('form',{class:'form-card'});
 const password=e('input',{type:'password',autocomplete:'current-password',required:true});
 const code=e('input',{type:'text',name:'code',autocomplete:'one-time-code',maxlength:'64',required:true});
 form.append(e('p',{text:'Pour désactiver le second facteur, confirmez les deux preuves :'}),
   e('label',{},'Mot de passe actuel',password),
   e('label',{},'Code TOTP ou code de secours',code),
   e('button',{type:'submit',class:'button secondary',text:'Désactiver le second facteur'}));
 panel.append(form);
 form.addEventListener('submit',handle(async event=>{
  event.preventDefault();
  await withBusy(form.querySelector('button[type=submit]'),async()=>{
   await request('POST','/api/me/mfa/disable',{password:password.value,code:code.value.trim()});
   onLogout();notice('Second facteur désactivé. Connectez-vous à nouveau.');
  },'Vérification de sécurité…');
 }));
}
export async function renderAccount(container,user,onLogout){
 container.replaceChildren(heading('Mon compte','Sécurisez votre accès à '+user.restaurantName+'.'));
 const layout=e('div',{class:'account-grid'});
 const password=passwordPanel(onLogout);
 const mfa=e('section',{class:'panel'});
 layout.append(password,mfa);container.append(layout);
 const status=await request('GET','/api/me/mfa');
 if(status.enabled)activeMfa(mfa,status,onLogout);
 else if(status.available)setupMfa(mfa,onLogout);
 else mfa.append(e('h2',{text:'Second facteur non configuré'}),
   e('p',{class:'muted',text:'Un administrateur technique doit installer une clé MFA privée sur le serveur avant que vous puissiez activer cette protection.'}));
}
