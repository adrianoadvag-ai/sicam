import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, initializeAuth, inMemoryPersistence, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
signOut, reauthenticateWithCredential, EmailAuthProvider, updatePassword, sendEmailVerification, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, initializeFirestore, doc, getDoc, getDocs, setDoc, updateDoc, collection, onSnapshot, writeBatch, runTransaction, query, where } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import * as CFG from './config.js';
const SICAM_FIREBASE=CFG.SICAM_FIREBASE;
const DOMINIOS=((CFG.SICAM_OPCOES&&CFG.SICAM_OPCOES.dominios)||['pm.pr.gov.br']).map(d=>d.toLowerCase());
/* ============ Estado ============ */
const $=s=>document.querySelector(s);
const configurado=SICAM_FIREBASE&&SICAM_FIREBASE.apiKey&&!/COLE/i.test(SICAM_FIREBASE.apiKey);
let app,auth,db;
let fase=configurado?'carregando':'naoconfig'; // naoconfig | carregando | setup | login | cadastro | verificar | aguardando | app | erro
let erroMsg='', loginMsg='';
const D0=()=>({users:[],tipos:[],unidades:[],reservas:[],lotes:[],catalogo:{},transfIn:[],catDoc:null,dirDoc:null});
const JANELA_DIAS=180; // o painel carrega sozinho as cautelas em andamento e as dos últimos 180 dias
let histTudo=false;
let D=D0();
let sess=null, bootstrapping=false, unsubs=[], loaded={};
const ui={view:null,cart:{},q:'',fs:'todos',tela:'cadete',mq:''};
(()=>{const st=document.createElement('style');st.textContent=`
.pill{display:inline-flex;align-items:center;gap:.35rem;font-weight:600;font-size:.84rem}
.pill::before{content:"";width:8px;height:8px;border-radius:50%;background:currentColor}
.pill.ok{color:var(--ok)}.pill.no{color:var(--stamp)}.eq.off h3{color:var(--muted)}
.aviso-seg{display:flex;gap:.55rem;align-items:flex-start;font-size:.85rem;color:var(--muted);border:1px solid var(--line);border-radius:8px;padding:.6rem .75rem;margin-top:1rem;background:var(--surface-2)}
.busca{position:sticky;top:0;background:var(--surface);padding:.2rem 0 .6rem;z-index:1}
.pick label[hidden],.lote-row[hidden]{display:none}
.pick label .ser{display:block;font-size:.72rem;color:var(--muted);font-family:var(--f-mono,monospace)}
.cnt{font-size:.85rem;font-weight:500;color:var(--muted)}.cnt.full{color:var(--ok)}
.falta{margin-top:.4rem;font-size:.82rem;color:var(--stamp)}
.lotes{display:grid;gap:.4rem;margin:.4rem 0 .9rem}
.lote-row{display:grid;grid-template-columns:1fr 110px;gap:.6rem;align-items:center;border:1px solid var(--line);border-radius:7px;padding:.4rem .55rem;background:var(--surface)}
.lote-row input{text-align:right}.lote-row .ser,.dev-mun .ser{display:block;font-size:.75rem;color:var(--muted)}
.dev-mun{padding:.6rem 0;border-bottom:1px solid var(--line)}.dev-mun:last-child{border-bottom:0}
.calc{font-size:.85rem;margin-top:.4rem}.calc.bad{color:var(--stamp);font-weight:600}
.qmun{display:flex;align-items:center;gap:.4rem}.qmun input{width:96px;text-align:right;min-height:40px}.qmun span{font-size:.82rem;color:var(--muted)}
.lim{font-size:.78rem;color:var(--muted);margin-top:.15rem}
.outros{list-style:none;padding:0;margin:.3rem 0 0;font-size:.86rem}.outros li{padding:.35rem 0;border-top:1px solid var(--line)}
.dupla{border:1px solid var(--line);border-radius:8px;padding:.8rem;background:var(--surface-2)}
.pick-trf{grid-template-columns:repeat(auto-fill,minmax(200px,1fr))}
.tag-mun{border-color:var(--brass)}
.sep-res{list-style:none;margin:.5rem 0 0;padding:0;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--surface)}
.sep-res li{display:flex;justify-content:space-between;align-items:center;gap:.6rem;padding:.45rem .6rem;border-bottom:1px solid var(--line)}
.sep-res li:last-child{border-bottom:0}.sep-res .mono{font-weight:600}
.sep-lbl{display:block;font-size:.85rem;font-weight:600;margin-bottom:.3rem}
.trf-in{border-left:4px solid var(--brass)}
.rel-box{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;justify-content:space-between;border:1px dashed var(--line);border-radius:8px;padding:.6rem .75rem;margin:.9rem 0}
.rel-box p{font-size:.85rem;color:var(--muted);margin:0}
.ass-box{border:1px solid var(--line);border-radius:10px;padding:.8rem;margin-top:.9rem;background:var(--surface-2)}
.ass-box .ou{text-align:center;font-size:.8rem;color:var(--muted);margin:.5rem 0}
.trf-lista{list-style:none;padding:0;margin:.3rem 0 0;border:1px solid var(--line);border-radius:8px;overflow:hidden}
.trf-lista li{display:flex;align-items:center;gap:.6rem;padding:.55rem .7rem;border-bottom:1px solid var(--line);background:var(--surface)}
.trf-lista li:last-child{border-bottom:0}
.trf-lista input[type=checkbox]{width:1.25rem;height:1.25rem;flex:none;appearance:auto;-webkit-appearance:checkbox;position:static;opacity:1;margin:0}
.trf-lista .q{width:84px;text-align:right;margin-left:auto}
.cart-li{display:flex;align-items:center;gap:.5rem;padding:.45rem 0;border-bottom:1px solid var(--line)}
.cart-li:last-child{border-bottom:0}.cart-li .nm{flex:1}
.mini{display:inline-flex;align-items:center;justify-content:center;min-width:2rem;height:2rem;border:1px solid var(--line);border-radius:6px;background:var(--surface);cursor:pointer;font-size:1rem}
.rm{color:var(--stamp);border-color:var(--stamp)}
.acesso-f{margin-top:1.3rem;text-align:center;font-size:.85rem}
.login.restrito{background:#141a12}.login.restrito .login-card{border-top:4px solid var(--brass)}
`;document.head.appendChild(st);})();

/* ============ Utilidades ============ */
const DOMINIO='@sicam.apmg';
const normLogin=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,'');
const emailDe=x=>{const t=String(x||'').trim().toLowerCase();return t.includes('@')?t:normLogin(t)+DOMINIO;};
const ehLegado=email=>String(email||'').toLowerCase().endsWith(DOMINIO);
const dominioOk=email=>DOMINIOS.some(d=>String(email||'').toLowerCase().endsWith('@'+d));
const emailUser=u=>u.email||emailDe(u.login);
let aguardandoUnsub=null;
const b64u=buf=>{const b=new Uint8Array(buf);let t='';for(let i=0;i<b.length;i++)t+=String.fromCharCode(b[i]);return btoa(t).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
const ub64u=x=>{x=x.replace(/-/g,'+').replace(/_/g,'/');x+='='.repeat((4-x.length%4)%4);return Uint8Array.from(atob(x),c=>c.charCodeAt(0));};
const bioKey=uid=>'sicam.bio.'+uid;
const bioLocal=uid=>{try{return localStorage.getItem(bioKey(uid));}catch(e){return null;}};
let bioOk=false;
(async()=>{try{bioOk=!!(window.PublicKeyCredential&&PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable&&await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());}catch(e){bioOk=false;}})();
const assinada=r=>r.status==='separada'&&!!r.assinatura;
const METODO={biometria:'com digital/Face ID no celular do militar',senha:'com senha no celular do militar',balcao:'com senha do militar no computador da Furrielação'};
const nowISO=()=>new Date().toISOString();
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=iso=>{if(!iso)return'—';const d=new Date(iso);return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+' '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});};
const toLocalInput=d=>{const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes());};
const nr=n=>'Nº '+String(n||0).padStart(3,'0');
const user=id=>D.users.find(u=>u.id===id)||{nome:'?',grad:'',pelotao:'',login:''};
const nomeM=id=>{const u=user(id);return (u.grad?u.grad+' ':'')+u.nome;};
const tipo=id=>D.tipos.find(t=>t.id===id)||{nome:'?'};
const unid=id=>D.unidades.find(u=>u.id===id);
const me=()=>sess&&D.users.find(u=>u.id===sess.userId);
const atrasada=r=>r.status==='cautelada'&&new Date(r.devolucao)<new Date();
const entrada=(a,obs)=>({t:nowISO(),a,por:sess.userId,obs:obs||''});
const MAXQ=10; // limite por item no pedido do cadete: não depende do estoque, para não revelar quantidades
const ehFurriel=()=>{const u=me();return !!u&&u.perfil==='furriel';};
const isMun=id=>tipo(id).mun===true;
const lotesDe=id=>D.lotes.filter(l=>l.tipoId===id);
const loteDe=id=>D.lotes.find(l=>l.id===id);
const loteTxt=x=>x.lote||(loteDe(x.loteId)||{}).lote||'?';
const munTxt=x=>`${x.qtd} cart. ${tipo(x.tipoId).nome} – lote ${loteTxt(x)}`;
const qtdNome=i=>isMun(i.tipoId)?`${i.qtd} cart. ${tipo(i.tipoId).nome}`:`${i.qtd}× ${tipo(i.tipoId).nome}`;
const itensDe=ids=>{const m={};ids.forEach(id=>{const u=unid(id);if(u)m[u.tipoId]=(m[u.tipoId]||0)+1;});return Object.entries(m).map(([tipoId,qtd])=>({tipoId,qtd}));};
const itensDeR=(ids,mun)=>{const m={};(mun||[]).forEach(x=>m[x.tipoId]=(m[x.tipoId]||0)+x.qtd);return itensDe(ids).concat(Object.entries(m).map(([tipoId,qtd])=>({tipoId,qtd})));};
const infoUnid=id=>{const u=unid(id);return u?{pat:u.pat,serie:u.serie||'',tipoId:u.tipoId}:null;};
const itensTxt=r=>(r.itens||[]).map(qtdNome).join(', ');
const itensLi=r=>'<ul class="itens">'+(r.itens||[]).map(i=>isMun(i.tipoId)?`<li><b>${i.qtd}</b><span>cart. ${esc(tipo(i.tipoId).nome)}</span></li>`:`<li><b>${i.qtd}×</b><span>${esc(tipo(i.tipoId).nome)}</span></li>`).join('')+'</ul>';
const munLi=r=>(r.municao||[]).map(x=>`<li><span class="mono">${x.qtd} cart.</span><span>${esc(tipo(x.tipoId).nome)} · lote ${esc(loteTxt(x))}</span></li>`).join('');
const ST={pendente:['Pendente','c-brass'],aprovada:['Aprovada','c-blue'],separada:['Pronta para retirada','c-blue'],
cautelada:['Cautelado','c-ok'],devolvida:['Devolvido','c-muted'],recusada:['Recusada','c-stamp'],cancelada:['Cancelada','c-muted'],transferida:['Transferida','c-muted']};
const stamp=(r,lg)=>assinada(r)?`<span class="stamp c-ok${lg?' lg':''}">Assinada</span>`:atrasada(r)?`<span class="stamp c-stamp${lg?' lg':''}">Em atraso</span>`:`<span class="stamp ${(ST[r.status]||['?',''])[1]}${lg?' lg':''}">${(ST[r.status]||[r.status])[0]}</span>`;
function contagem(tipoId){
if(!ehFurriel()){const ok=!!D.catalogo[tipoId];return {total:0,disponivel:0,separado:0,cautelado:0,manutencao:0,extraviado:0,reservado:0,livre:ok?1:0};}
if(isMun(tipoId)){
const soma=st=>D.reservas.filter(r=>r.status===st).reduce((a,r)=>a+(r.municao||[]).filter(x=>x.tipoId===tipoId).reduce((b,x)=>b+x.qtd,0),0);
const est=lotesDe(tipoId).reduce((a,l)=>a+(l.qtd||0),0),sep=soma('separada'),caut=soma('cautelada');
const reservado=D.reservas.filter(r=>r.status==='pendente'||r.status==='aprovada').reduce((a,r)=>a+(r.itens||[]).filter(i=>i.tipoId===tipoId).reduce((b,i)=>b+i.qtd,0),0);
return {total:est+sep+caut,disponivel:est,separado:sep,cautelado:caut,manutencao:0,extraviado:0,reservado,livre:Math.max(0,est-reservado),mun:true};
}
const c={total:0,disponivel:0,separado:0,cautelado:0,manutencao:0,extraviado:0};
D.unidades.forEach(u=>{if(u.tipoId===tipoId){c.total++;c[u.status]=(c[u.status]||0)+1;}});
c.reservado=D.reservas.filter(r=>r.status==='pendente'||r.status==='aprovada')
.reduce((s,r)=>s+(r.itens||[]).filter(i=>i.tipoId===tipoId).reduce((a,i)=>a+i.qtd,0),0);
c.livre=Math.max(0,c.disponivel-c.reservado);
return c;
}
function toast(msg,bad){const t=document.createElement('div');t.className='toast'+(bad?' bad':'');t.textContent=msg;$('#toasts').appendChild(t);setTimeout(()=>t.remove(),5500);}
function erroFirebase(e){
const c=(e&&e.code)||'';
const m={'auth/invalid-credential':'Usuário ou senha incorretos.','auth/wrong-password':'Usuário ou senha incorretos.','auth/user-not-found':'Usuário ou senha incorretos.',
'auth/invalid-email':'Usuário inválido. Use só letras, números, ponto ou hífen.','auth/too-many-requests':'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
'auth/email-already-in-use':'Já existe uma conta com esse usuário.','auth/weak-password':'A senha precisa ter pelo menos 6 caracteres.',
'auth/network-request-failed':'Sem conexão com a internet.','permission-denied':'Sem permissão para essa ação. Confira se as regras do Firestore foram publicadas.',
'unavailable':'Sem conexão com o servidor. Tente de novo.','auth/operation-not-allowed':'O login por e-mail e senha não foi ativado no Firebase (Authentication → Método de login).'};
return m[c]||('Erro: '+(e&&e.message||c||'desconhecido'));
}
async function avisar(titulo,corpo){
toast(titulo+(corpo?' – '+corpo:''));
try{navigator.vibrate&&navigator.vibrate(200);}catch(e){}
try{
if('Notification' in window&&Notification.permission==='granted'&&document.hidden){
const reg=await navigator.serviceWorker?.getRegistration();
if(reg)reg.showNotification(titulo,{body:corpo||'',icon:'icon-192.png',badge:'icon-192.png',tag:'sicam'});
}
}catch(e){}
}
const SEAL=`<svg class="seal" viewBox="0 0 54 62" fill="none" aria-hidden="true"><path d="M27 2 50 10v20c0 15-10 25-23 30C14 55 4 45 4 30V10L27 2Z" stroke="currentColor" stroke-width="3"/><path d="M16 22h22M16 30h22M16 38h14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="m32 40 4 4 7-9" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const IC={
eq:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16v12H4zM9 7V5h6v2M4 12h16"/></svg>',
rs:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3h9l4 4v14H6zM9 12h7M9 16h7M9 8h3"/></svg>',
pf:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>'
};
/* ============ Modal ============ */
const modal=$('#modal');
if(modal&&typeof modal.showModal!=='function'){ // iPhone com iOS anterior ao 15.4
modal.showModal=function(){this.setAttribute('open','');this.style.cssText='display:block;position:fixed;inset:0;margin:auto;z-index:1000;max-height:92vh;max-width:640px;width:94vw;overflow:auto';};
modal.close=function(){this.removeAttribute('open');this.style.display='none';};
try{Object.defineProperty(modal,'open',{get(){return this.hasAttribute('open');}});}catch(e){}
}
window.addEventListener('error',e=>{if(typeof fase!=='undefined'&&fase==='carregando'){const a=document.getElementById('app');if(a)a.innerHTML='<div class="loading"><div>Erro ao abrir o SICAM: '+String(e.message||'desconhecido').replace(/[<>&]/g,'')+'<br><button class="btn" onclick="location.reload()">Tentar de novo</button></div></div>';}});
function openModal(title,body,foot,sub){
modal.innerHTML=`<div class="mh"><div><h2>${title}</h2>${sub?`<p class="muted small">${sub}</p>`:''}</div><button class="x" data-act="fechar" aria-label="Fechar">×</button></div>
<div class="mb">${body}</div>${foot?`<div class="mf">${foot}</div>`:''}`;
if(!modal.open)modal.showModal();
}
const closeModal=()=>{if(modal.open)modal.close();};
modal.addEventListener('click',e=>{if(e.target===modal)closeModal();});
/* ============ Telas de entrada ============ */
function vNaoConfig(){
return `<main class="login"><div class="login-card stack">
<div class="brand">${SEAL}<div><h1>SICAM</h1><p>Falta ligar o app ao Firebase</p></div></div>
<p>Abra o arquivo <b>config.js</b> e cole ali os dados do seu projeto Firebase, como está no guia de instalação.</p></div></main>`;
}
function vErro(){
return `<main class="login"><div class="login-card stack">
<div class="brand">${SEAL}<div><h1>SICAM</h1><p>Não foi possível conectar</p></div></div>
<p class="erro">${esc(erroMsg)}</p><button class="btn btn-pri btn-block" data-act="recarregar">Tentar de novo</button></div></main>`;
}
function vCarregando(){return `<div class="loading"><div><div class="spin"></div>Carregando…</div></div>`;}
function vSetup(){
return `<main class="login"><div class="login-card">
<div class="brand">${SEAL}<div><h1>SICAM</h1><p>Configuração inicial – crie a conta do Furriel</p></div></div>
<form id="f-setup" class="stack" autocomplete="off">
<p class="aviso">Esta tela só aparece uma vez. A primeira conta criada aqui será a do Furriel, que depois cadastra os demais militares.</p>
<div class="grid2"><label class="f"><span>Posto / graduação</span><input class="i" name="grad" value="Cad PM"></label>
<label class="f"><span>Nome de guerra</span><input class="i" name="nome" required></label></div>
<label class="f"><span>Usuário (para entrar no sistema)</span><input class="i" name="login" required autocapitalize="off" placeholder="furriel"></label>
<label class="f"><span>Senha (mínimo 6 caracteres)</span><input class="i" name="senha" type="password" required minlength="6"></label>
<label class="check"><input type="checkbox" name="exemplo" checked><span>Carregar material de exemplo (HT, capacete, colete, tonfa, capa e lanterna) para os testes</span></label>
<p class="erro" id="setup-erro"></p>
<button class="btn btn-pri btn-block">Criar conta do Furriel</button>
</form></div></main>`;
}
function vLogin(){
return `<main class="login"><div class="login-card">
<div class="brand">${SEAL}<div><h1>SICAM</h1><p>Cautela de material coletivo da Furrielação – APMG</p></div></div>
<form id="f-login" class="stack" autocomplete="on">
<label class="f"><span>E-mail institucional</span><input class="i" name="login" required autocapitalize="off" autocomplete="username" inputmode="email"></label>
<label class="f"><span>Senha</span><input class="i" name="senha" type="password" required autocomplete="current-password"></label>
<p class="erro" id="login-erro">${esc(loginMsg)}</p>
<button class="btn btn-pri btn-block">Entrar</button>
</form>
<div class="row between" style="margin-top:1rem"><button class="link" data-act="esqueci">Esqueci minha senha</button><button class="link" data-act="irCadastro">Criar minha conta</button></div>
<p class="acesso-f"><button class="link muted" data-act="telaF">Acesso restrito da Furrielação</button></p>
</div></main>`;
}
function vLoginFurriel(){
return `<main class="login restrito"><div class="login-card">
<div class="brand">${SEAL}<div><h1>SICAM</h1><p>Painel da Furrielação</p></div></div>
<p style="margin:-.4rem 0 1rem"><span class="stamp c-stamp">Acesso restrito</span></p>
<form id="f-login" class="stack" autocomplete="on" data-tela="furriel">
<label class="f"><span>E-mail</span><input class="i" name="login" required autocapitalize="off" autocomplete="username" inputmode="email"></label>
<label class="f"><span>Senha</span><input class="i" name="senha" type="password" required autocomplete="current-password"></label>
<p class="erro" id="login-erro">${esc(loginMsg)}</p>
<button class="btn btn-pri btn-block">Entrar no painel</button>
</form>
<div class="row between" style="margin-top:1rem"><button class="link" data-act="esqueci">Esqueci minha senha</button><button class="link" data-act="irCadastroF">Solicitar conta de Furriel</button></div>
<p class="acesso-f"><button class="link muted" data-act="telaC">← Voltar ao acesso dos cadetes</button></p>
</div></main>`;
}
function vCadastroF(){
return `<main class="login restrito"><div class="login-card">
<div class="brand">${SEAL}<div><h1>SICAM</h1><p>Solicitar conta de Furriel</p></div></div>
<form id="f-cadf" class="stack" autocomplete="off">
<p class="aviso">A conta de Furriel só funciona depois de confirmar o e-mail e de ser aprovada por um Furriel já ativo.</p>
<div class="grid2"><label class="f"><span>Posto / graduação</span><input class="i" name="grad" value="Cad PM" required></label>
<label class="f"><span>Nome de guerra</span><input class="i" name="nome" required></label></div>
<label class="f"><span>E-mail institucional</span><input class="i" name="email" type="email" required autocapitalize="off" placeholder="nome@${esc(DOMINIOS[0])}"></label>
<div class="grid2"><label class="f"><span>Senha (mín. 8)</span><input class="i" name="senha" type="password" required minlength="8" autocomplete="new-password"></label>
<label class="f"><span>Repita a senha</span><input class="i" name="senha2" type="password" required minlength="8" autocomplete="new-password"></label></div>
<p class="erro" id="cadf-erro"></p>
<button class="btn btn-pri btn-block">Solicitar conta</button>
<button type="button" class="btn btn-block" data-act="telaF">Voltar</button>
</form></div></main>`;
}
function vCadastro(){
return `<main class="login"><div class="login-card">
<div class="brand">${SEAL}<div><h1>SICAM</h1><p>Criar minha conta</p></div></div>
<form id="f-cad" class="stack" autocomplete="off">
<div class="grid2"><label class="f"><span>Posto / graduação</span><input class="i" name="grad" value="Cad PM" required></label>
<label class="f"><span>Nome de guerra</span><input class="i" name="nome" required></label></div>
<div class="grid2"><label class="f"><span>Nº de aluno / RG</span><input class="i" name="num" required inputmode="numeric"></label>
<label class="f"><span>Pelotão</span><input class="i" name="pel" required placeholder="Ex.: 1º Pelotão Alfa"></label></div>
<label class="f"><span>E-mail institucional</span><input class="i" name="email" type="email" required autocapitalize="off" placeholder="nome@${esc(DOMINIOS[0])}"></label>
<div class="grid2"><label class="f"><span>Crie uma senha (mín. 6)</span><input class="i" name="senha" type="password" required minlength="6" autocomplete="new-password"></label>
<label class="f"><span>Repita a senha</span><input class="i" name="senha2" type="password" required minlength="6" autocomplete="new-password"></label></div>
<p class="small muted">Você vai receber um link no e-mail institucional para confirmar a conta. Depois, a Furrielação libera seu acesso.</p>
<p class="erro" id="cad-erro"></p>
<button class="btn btn-pri btn-block">Criar conta</button>
<button type="button" class="btn btn-block" data-act="irLogin">Já tenho conta</button>
</form></div></main>`;
}
function vVerificar(){
const e=auth.currentUser?auth.currentUser.email:'';
return `<main class="login"><div class="login-card stack">
<div class="brand">${SEAL}<div><h1>SICAM</h1><p>Confirme seu e-mail</p></div></div>
<p>Enviamos um link para <b>${esc(e)}</b>. Abra seu e-mail institucional, clique no link e volte aqui.</p>
<p class="aviso">Não chegou? Procure na caixa de spam ou lixo eletrônico. O remetente é noreply@${esc(SICAM_FIREBASE.authDomain||'firebaseapp.com')}.</p>
<p class="erro" id="ver-erro"></p>
<button class="btn btn-pri btn-block" data-act="jaConfirmei">Já confirmei</button>
<button class="btn btn-block" data-act="reenviar">Reenviar o e-mail</button>
<button class="btn btn-block" data-act="sair">Sair</button></div></main>`;
}
function vAguardando(){
return `<main class="login"><div class="login-card stack">
<div class="brand">${SEAL}<div><h1>SICAM</h1><p>Cadastro recebido</p></div></div>
<p>Seu e-mail foi confirmado. Agora a Furrielação precisa liberar seu acesso.</p>
<p class="muted small">Esta tela atualiza sozinha assim que o acesso for liberado.</p>
<button class="btn btn-block" data-act="sair">Sair</button></div></main>`;
}
/* ============ App do solicitante ============ */
function vApp(){
const u=me(), v=ui.view||'equip';
const minhas=D.reservas.filter(r=>r.userId===u.id);
const ativas=minhas.filter(r=>['pendente','aprovada','separada','cautelada'].includes(r.status)).length;
let body='', title='', sub='';
if(v==='equip'){title='Material disponível';sub='Escolha as quantidades e envie a solicitação ao Furriel.';body=vEquip(u);}
if(v==='reservas'){title='Minhas solicitações';sub='Acompanhe cada pedido até a devolução.';body=vMinhas(minhas);}
if(v==='perfil'){title='Meus dados';sub=esc(nomeM(u.id));body=vPerfil(u);}
const n=Object.values(ui.cart).filter(q=>q>0).length;
return `<header class="m-top"><div class="wrap"><p>${esc(nomeM(u.id))} · ${esc(u.pelotao)}</p><h1>${title}</h1><p>${sub}</p></div></header>
<main class="m-main">${body}</main>
${v==='equip'&&n?`<div class="cartbar"><div class="in"><span>${n} ${n>1?'itens na lista':'item na lista'}</span><button class="btn" data-act="cartLimpar">Limpar</button><button class="btn" data-act="solicitar">Revisar e solicitar</button></div></div>`:''}
<nav class="bnav" aria-label="Navegação"><div class="in">
<button data-act="go" data-v="equip" ${v==='equip'?'aria-current="page"':''}>${IC.eq}Material</button>
<button data-act="go" data-v="reservas" ${v==='reservas'?'aria-current="page"':''}>${IC.rs}Solicitações${ativas?` (${ativas})`:''}</button>
<button data-act="go" data-v="perfil" ${v==='perfil'?'aria-current="page"':''}>${IC.pf}Perfil</button>
</div></nav>`;
}
function vEquip(u){
const comigo=D.reservas.filter(r=>r.userId===u.id&&r.status==='cautelada');
const prontas=D.reservas.filter(r=>r.userId===u.id&&r.status==='separada');
let h='';
const tin=D.transfIn.filter(r=>r.status==='cautelada'&&r.transferPara===u.id&&r.transfer);
if(tin.length)h+=`<div class="sec-h"><h2>Transferência para você</h2></div>`+tin.map(r=>`<div class="card trf-in" style="margin-bottom:.6rem">
<p><b>${esc(nomeM(r.userId))}</b> quer transferir para você:</p><ul class="itens">${liTransfer(r)}</ul>
<p class="small muted" style="margin-top:.4rem">Devolver até ${fmt(r.devolucao)}</p>
<div class="row" style="margin-top:.7rem;justify-content:flex-end"><button class="btn btn-sm btn-warn" data-act="recusarTransf" data-id="${r.id}">Recusar</button><button class="btn btn-sm btn-pri" data-act="aceitarTransf" data-id="${r.id}">Aceitar e assinar</button></div></div>`).join('');
if(prontas.length)h+=`<div class="sec-h"><h2>Pronto para retirada</h2></div>`+prontas.map(r=>`<div class="card active-cautela" style="margin-bottom:.6rem;border-left-color:var(--blue)">
<div class="card-t"><div><span class="nr">${nr(r.num)}</span>${itensLi(r)}</div>${stamp(r)}</div>
${r.assinatura?`<p class="small muted" style="margin-top:.5rem">Você assinou às ${fmt(r.assinatura.em)}. Aguarde o Furriel confirmar a entrega.</p>`
:`<p class="small" style="margin-top:.5rem">Na Furrielação, confira o material e assine a retirada.</p><button class="btn btn-pri btn-block" style="margin-top:.6rem" data-act="assinar" data-id="${r.id}">Assinar retirada</button>`}</div>`).join('');
if(comigo.length){
h+=`<div class="sec-h"><h2>Cautelado com você</h2></div>`+comigo.map(r=>`<div class="card active-cautela${atrasada(r)?' late':''}" style="margin-bottom:.6rem">
<button class="clickable" style="background:none;border:0;padding:0" data-act="ver" data-id="${r.id}">
<div class="card-t"><div><span class="nr">${nr(r.num)}</span>${itensLi(r)}</div>${stamp(r)}</div>
<p class="small ${atrasada(r)?'c-stamp':'muted'}" style="margin-top:.4rem">Devolver até ${fmt(r.devolucao)}</p></button>
${r.transferPara?`<p class="small c-brass" style="margin-top:.5rem">Transferência para ${esc(nomeM(r.transferPara))} aguardando o aceite dele.</p>`:''}
${r.devAssCadete?`<p class="small c-ok" style="margin-top:.5rem">Você assinou a devolução às ${fmt(r.devAssCadete.em)}. Aguarde o Furriel conferir e assinar.</p>`:''}
<div class="row" style="margin-top:.7rem;justify-content:flex-end"><button class="btn btn-sm" data-act="ver" data-id="${r.id}">Ver detalhes</button>${r.devAssCadete?'':r.transferPara?`<button class="btn btn-sm btn-warn" data-act="cancelarTransf" data-id="${r.id}">Cancelar transferência</button>`:`<button class="btn btn-sm" data-act="transferir" data-id="${r.id}">Transferir</button><button class="btn btn-sm btn-pri" data-act="devolverCadete" data-id="${r.id}">Devolver material</button>`}</div></div>`).join('');
h+=`<div class="sec-h"><h2>Material da Furrielação</h2></div>`;
}
const vis=D.tipos.filter(t=>!t.oculto);
if(!vis.length)return h+'<div class="empty">Nenhum material cadastrado ainda.</div>';
const cats=catsPresentes(vis);if(ui.cat&&ui.cat!=='Todos'&&!cats.includes(ui.cat))ui.cat='Todos';
const q=normTxt(ui.busca);
const pill=ok=>ok?'<span class="pill ok">Disponível</span>':'<span class="pill no">Indisponível</span>';
const cardT=t=>{const ok=contagem(t.id).livre>0, qn=ui.cart[t.id]||0;
if(t.mun){const lim=t.limite||100;
return `<div class="card eq${ok?'':' off'}">
<div><h3>${esc(t.nome)}</h3><p class="avail">${pill(ok)}${t.desc?' <span class="muted">– '+esc(t.desc)+'</span>':''}</p><p class="lim">Até ${lim} cartuchos por pedido</p></div>
<label class="qmun"><input class="i" type="number" inputmode="numeric" min="0" max="${lim}" step="1" value="${qn||''}" placeholder="0" data-chg="mun" data-id="${t.id}" ${ok||qn?'':'disabled'} aria-label="Cartuchos de ${esc(t.nome)}"><span>cart.</span></label>
</div>`;}
return `<div class="card eq${ok?'':' off'}">
<div><h3>${esc(t.nome)}</h3><p class="avail">${pill(ok)}${t.desc?' <span class="muted">– '+esc(t.desc)+'</span>':''}</p></div>
<div class="stepper" role="group" aria-label="Quantidade de ${esc(t.nome)}">
<button data-act="cart" data-id="${t.id}" data-d="-1" ${qn?'':'disabled'} aria-label="Diminuir">−</button>
<output>${qn}</output>
<button data-act="cart" data-id="${t.id}" data-d="1" ${ok&&qn<MAXQ?'':'disabled'} aria-label="Aumentar">+</button>
</div>
</div>`;};
h+=`<div class="filterbar"><input class="i" type="search" placeholder="Buscar material (ex.: pistola, HT, algema)" value="${esc(ui.busca||'')}" data-inp="busca" aria-label="Buscar material">
<div class="chips" role="group" aria-label="Categorias">${['Todos',...cats].map(c=>`<button class="chip" data-act="cat" data-c="${esc(c)}" aria-pressed="${(ui.cat||'Todos')===c}">${esc(c)}</button>`).join('')}</div></div>`;
let algum=false;
for(const c of cats){
if(ui.cat&&ui.cat!=='Todos'&&ui.cat!==c)continue;
const l=ordTipos(vis.filter(t=>catOf(t)===c&&(!q||normTxt(t.nome+' '+(t.desc||'')).includes(q))));
if(!l.length)continue;algum=true;
h+=`<h2 class="cat-h">${esc(c)}<span class="muted small">${l.length} ${l.length>1?'tipos':'tipo'}</span></h2><div class="stack">${l.map(cardT).join('')}</div>`;
}
if(!algum)h+=`<div class="empty">Nenhum material encontrado${q?` para "${esc(ui.busca)}"`:''}.</div>`;
h+=`<p class="aviso-seg"><span aria-hidden="true">🔒</span><span>Por segurança, o app não informa as quantidades da Furrielação. Se o pedido não puder ser atendido por completo, o Furriel separa o que houver e você vê o resultado na solicitação.</span></p>`;
return h;
}
function cardReserva(r){
return `<button class="card clickable" data-act="ver" data-id="${r.id}">
<div class="card-t"><div><span class="nr">${nr(r.num)}</span>${itensLi(r)}</div>${stamp(r)}</div>
<dl class="meta"><dt>Retirada</dt><dd>${fmt(r.retirada)}</dd><dt>Devolução</dt><dd>${fmt(r.devolucao)}</dd><dt>Finalidade</dt><dd>${esc(r.finalidade)}</dd></dl>
</button>`;
}
function vMinhas(list){
const rel=list.length?`<div class="rel-box"><p>Meu histórico completo de cautelas</p><div class="row"><button class="btn btn-sm" data-act="relPDF" data-escopo="meus">PDF</button><button class="btn btn-sm" data-act="relXLS" data-escopo="meus">Excel</button></div></div>`:'';
return rel+vMinhas0(list);
}
function vMinhas0(list){
if(!list.length)return `<div class="empty"><p>Você ainda não fez nenhuma solicitação.</p><p style="margin-top:.7rem"><button class="btn btn-pri" data-act="go" data-v="equip">Ver material disponível</button></p></div>`;
const ord=['separada','aprovada','pendente','cautelada'];
const s=[...list].sort((a,b)=>{const ia=ord.indexOf(a.status),ib=ord.indexOf(b.status);return (ia<0?9:ia)-(ib<0?9:ib)||b.num-a.num;});
return '<div class="stack">'+s.map(cardReserva).join('')+'</div>';
}
function botaoAvisos(){
if(!('Notification' in window))return '';
if(Notification.permission==='granted')return '<p class="small muted">Avisos neste aparelho: ativados.</p>';
if(Notification.permission==='denied')return '<p class="small muted">Avisos bloqueados neste aparelho. Libere nas configurações do navegador.</p>';
return '<button class="btn btn-block" data-act="avisos">Ativar avisos neste aparelho</button>';
}
function vPerfil(u){
const tot=D.reservas.filter(r=>r.userId===u.id);
return `<div class="card"><dl class="meta" style="margin:0">
<dt>Nome</dt><dd>${esc(nomeM(u.id))}</dd><dt>Usuário</dt><dd class="mono">${esc(u.login)}</dd><dt>Pelotão</dt><dd>${esc(u.pelotao)}</dd>
<dt>Solicitações</dt><dd>${tot.length} no total</dd></dl></div>
<p class="small muted" style="margin-top:.8rem">${tot.some(r=>r.status==='cautelada')?'Para passar um material cautelado a outro cadete, use "Transferir cautela" em Material → Cautelado com você.':'A opção "Transferir cautela" aparece em Material → Cautelado com você, depois que a Furrielação entregar o material a você.'}</p>
<div class="stack" style="margin-top:1rem">${botaoAvisos()}${bioOk?(bioLocal(u.id)&&(u.passkeys||[]).some(k=>k.id===bioLocal(u.id))?'<p class="small muted">Assinatura por digital/Face ID: ativada neste celular.</p>':'<button class="btn btn-block" data-act="ativarBio">Ativar assinatura por digital, Face ID ou senha do celular</button>'):''}<button class="btn btn-block" data-act="senha">Trocar minha senha</button><button class="btn btn-block" data-act="sair">Sair</button></div>`;
}
function fichaCarrinho(){
const itens=Object.entries(ui.cart).filter(([,q])=>q>0);
return `<p class="small muted" style="margin-bottom:.3rem">Confira a lista. Se escolheu algo sem querer, toque em ✕ para remover.</p>`+itens.map(([id,q])=>isMun(id)
?`<div class="cart-li"><span class="nm"><b>${q}</b> cart. ${esc(tipo(id).nome)}</span><button type="button" class="mini rm" data-act="cartRm" data-id="${id}" aria-label="Remover ${esc(tipo(id).nome)}">✕</button></div>`
:`<div class="cart-li"><span class="nm">${esc(tipo(id).nome)}</span><button type="button" class="mini" data-act="cartQ" data-id="${id}" data-d="-1" aria-label="Diminuir">−</button><b>${q}</b><button type="button" class="mini" data-act="cartQ" data-id="${id}" data-d="1" ${q>=MAXQ?'disabled':''} aria-label="Aumentar">+</button><button type="button" class="mini rm" data-act="cartRm" data-id="${id}" aria-label="Remover ${esc(tipo(id).nome)}">✕</button></div>`).join('');
}
function atualizarCarrinho(){const n=Object.values(ui.cart).filter(q=>q>0).length;if(!n){closeModal();render();toast('Lista vazia.');return;}const f=$('#ficha-cart');if(f)f.innerHTML=fichaCarrinho();render();}
function abrirSolicitacao(){
const itens=Object.entries(ui.cart).filter(([,q])=>q>0);
const a=new Date(Date.now()+2*3600e3);a.setMinutes(0,0,0);
const b=new Date(a.getTime()+24*3600e3);
openModal('Nova solicitação',`<form id="f-sol" class="stack">
<div class="ficha" id="ficha-cart">${fichaCarrinho()}</div>
<div class="grid2">
<label class="f"><span>Retirada</span><input class="i" type="datetime-local" name="ret" value="${toLocalInput(a)}" required></label>
<label class="f"><span>Devolução prevista</span><input class="i" type="datetime-local" name="dev" value="${toLocalInput(b)}" required></label>
</div>
<label class="f"><span>Finalidade</span><select class="i" name="fin">${['Instrução','Serviço','Policiamento / operação','Formatura / solenidade','Outra'].map(x=>`<option>${x}</option>`).join('')}</select></label>
<label class="f"><span>Observação (opcional)</span><textarea class="i" name="obs" placeholder="Ex.: instrução de tiro, turma B"></textarea></label>
<p class="erro" id="sol-erro"></p>
<button class="btn btn-pri btn-block">Enviar solicitação</button></form>`,'',
'O Furriel recebe o pedido, confere o que há disponível e avisa quando o material estiver separado.');
}
async function enviarSolicitacao(fd){
const ret=new Date(fd.get('ret')), dev=new Date(fd.get('dev'));
if(!(dev>ret)){$('#sol-erro').textContent='A devolução precisa ser depois da retirada.';return;}
const itens=Object.entries(ui.cart).filter(([,q])=>q>0).map(([tipoId,qtd])=>({tipoId,qtd}));
if(!itens.length){$('#sol-erro').textContent='Escolha ao menos um material.';return;}
for(const i of itens){const t=tipo(i.tipoId);if(t.mun&&i.qtd>(t.limite||100)){$('#sol-erro').textContent=`${t.nome}: o limite é ${t.limite||100} cartuchos por pedido.`;return;}if(contagem(i.tipoId).livre<=0){$('#sol-erro').textContent=`${t.nome} ficou indisponível agora. Retire da lista para continuar.`;return;}}
const ref=doc(collection(db,'reservas'));
const r={userId:sess.userId,itens,retirada:ret.toISOString(),devolucao:dev.toISOString(),finalidade:fd.get('fin'),obs:String(fd.get('obs')||'').trim(),
status:'pendente',unidades:[],cond:{},log:[entrada('Solicitada')],criadoEm:nowISO()};
let n=0;
await runTransaction(db,async tx=>{
const cref=doc(db,'config','contador');const c=await tx.get(cref);
n=((c.exists()&&c.data().seq)||0)+1;tx.update(cref,{seq:n});tx.set(ref,{...r,num:n});
});
ui.cart={};ui.view='reservas';closeModal();render();toast(`Solicitação ${nr(n)} enviada ao Furriel.`);
}
function trocarSenha(){
openModal('Trocar minha senha',`<form id="f-senha" class="stack" autocomplete="off">
<label class="f"><span>Senha atual</span><input class="i" type="password" name="atual" required></label>
<label class="f"><span>Nova senha (mínimo 6 caracteres)</span><input class="i" type="password" name="nova" required minlength="6"></label>
<p class="erro" id="senha-erro"></p><button class="btn btn-pri btn-block">Salvar nova senha</button></form>`);
}
/* ============ Detalhe ============ */
function verReserva(id){
const r=D.reservas.find(x=>x.id===id); if(!r)return;
const u=me(), admin=u.perfil==='furriel';
const passos=r.origem?[['Transferência','Recebida por transferência'],['Devolvida','Devolvido']]:[['Solicitada','Solicitada'],['Aprovada','Aprovada pelo Furriel'],['Separada','Material separado'],['Assinada','Retirada assinada pelo militar'],['Cautelada','Entrega confirmada pelo Furriel'],['Devolvida','Devolvido']];
if(r.status==='transferida')passos[passos.length-1]=['Transferida','Cautela transferida'];
const log=r.log||[];const find=a=>log.find(l=>l.a===a);
const fim=log.find(l=>l.a==='Recusada'||l.a==='Cancelada');
let tl='<ol class="tl">';
for(const [a,label] of passos){
const l=find(a);
if(!l&&fim){tl+=`<li class="bad"><b>${fim.a}</b><span>${fmt(fim.t)} · ${esc(nomeM(fim.por))}${fim.obs?' – '+esc(fim.obs):''}</span></li>`;break;}
tl+=`<li class="${l?'done':''}"><b>${label}</b><span>${l?fmt(l.t)+' · '+esc(nomeM(l.por))+(l.obs?' – '+esc(l.obs):''):'—'}</span></li>`;
}
tl+='</ol>';
const nomesP=passos.map(p=>p[0]).concat(['Recusada','Cancelada']);const outros=log.filter(l=>!nomesP.includes(l.a));
if(outros.length)tl+=`<p class="small muted">Outros registros</p><ul class="outros">${outros.map(l=>`<li><b>${esc(l.a)}</b> · ${fmt(l.t)}${l.obs?' – '+esc(l.obs):''}</li>`).join('')}</ul>`;
const us=r.unidades||[];
const pats=us.length?`<p class="small muted" style="margin-top:.7rem">Patrimônios</p><div class="row" style="margin-top:.25rem">${us.map(id=>{const x=unid(id);const cd=r.cond&&r.cond[id];
return `<span class="tag mono">${esc(x?x.pat:id)}${cd&&cd!=='ok'?` – ${cd==='avaria'?'avaria':'extraviado'}`:''}</span>`;}).join('')}</div>`:'';
const body=`<div class="ficha">${stamp(r,true)}
<p class="nr">${nr(r.num)}</p><p style="font-weight:600;margin-top:.1rem">${esc(nomeM(r.userId))}</p><p class="small muted">${esc(user(r.userId).pelotao||'')}</p>
${itensLi(r)}
${r.itensSol?`<p class="small c-brass" style="margin-top:.3rem">Atendida parcialmente. Pedido original: ${esc(r.itensSol.map(qtdNome).join(', '))}</p>`:''}
<dl class="meta"><dt>Retirada</dt><dd>${fmt(r.retirada)}</dd><dt>Devolução</dt><dd class="${atrasada(r)?'c-stamp':''}">${fmt(r.devolucao)}</dd><dt>Finalidade</dt><dd>${esc(r.finalidade)}</dd>${r.obs?`<dt>Obs.</dt><dd>${esc(r.obs)}</dd>`:''}</dl>
${pats}${(r.municao||[]).length?`<p class="small muted" style="margin-top:.7rem">Munição entregue</p><div class="row" style="margin-top:.25rem">${r.municao.map(x=>`<span class="tag tag-mun">${esc(munTxt(x))}</span>`).join('')}</div>
${(r.devMun||[]).map(x=>`<p class="small muted" style="margin-top:.3rem">${esc(tipo(x.tipoId).nome)} (lote ${esc(loteTxt(x))}): ${x.cons} utilizado(s)${x.dev?`, sobra de ${x.dev} devolvida`:', sem sobra'}</p>`).join('')}`:''}</div>
<h3 style="margin-top:1.1rem">Andamento</h3>${tl}
<div class="rel-box"><p>Relatório desta cautela</p><div class="row"><button class="btn btn-sm" data-act="relPDF" data-escopo="uma" data-id="${r.id}">PDF</button><button class="btn btn-sm" data-act="relXLS" data-escopo="uma" data-id="${r.id}">Excel</button></div></div>`;
let foot='';
if(!admin&&['pendente','aprovada'].includes(r.status))foot=`<button class="btn btn-warn" data-act="cancelar" data-id="${r.id}">Cancelar solicitação</button>`;
if(!admin&&r.status==='separada'&&!r.assinatura)foot=`<p class="small muted" style="margin-right:auto">Assine quando estiver na Furrielação, com o material na sua frente.</p><button class="btn btn-pri" data-act="assinar" data-id="${r.id}">Assinar retirada</button>`;
if(!admin&&assinada(r))foot=`<p class="small muted" style="margin-right:auto">Assinado. Aguarde o Furriel confirmar a entrega.</p>`;
if(!admin&&r.status==='cautelada'&&r.userId===u.id)foot=r.devAssCadete?`<p class="small c-ok" style="margin-right:auto">Devolução assinada. Aguarde o Furriel conferir e assinar.</p>`:r.transferPara?`<p class="small c-brass" style="margin-right:auto">Aguardando o aceite de ${esc(nomeM(r.transferPara))}.</p><button class="btn btn-warn" data-act="cancelarTransf" data-id="${r.id}">Cancelar transferência</button>`:`<button class="btn" data-act="transferir" data-id="${r.id}">Transferir</button><button class="btn btn-pri" data-act="devolverCadete" data-id="${r.id}">Devolver material</button>`;
if(admin)foot=acoesAdmin(r,true);
openModal('Solicitação '+nr(r.num),body,foot);
}
async function cancelar(id){
const r=R(id); if(!r||!['pendente','aprovada'].includes(r.status))return;
if(!confirm('Cancelar esta solicitação?'))return;
await updateDoc(doc(db,'reservas',id),{status:'cancelada',log:[...r.log,entrada('Cancelada','Pelo solicitante')]});
closeModal();toast(`Solicitação ${nr(r.num)} cancelada.`);
}
/* ============ Transferência de cautela (cadete → cadete) ============ */
function transferir(id){
const r=R(id),u=me();if(!r||r.status!=='cautelada'||r.userId!==u.id)return;
if(r.transferPara){toast(`Já existe um pedido de transferência para ${nomeM(r.transferPara)} aguardando aceite.`,true);return;}
if(r.devAssCadete){toast('Você já assinou a devolução desta cautela.',true);return;}
const dest=D.users.filter(x=>x.ativo&&!x.pendente&&x.perfil==='aluno'&&x.id!==u.id).sort((a,b)=>a.nome.localeCompare(b.nome));
const nItens=r.unidades.length+(r.municao||[]).length;
openModal('Transferir cautela – '+nr(r.num),`<form id="f-trf" data-id="${r.id}" class="stack" autocomplete="off">
<div><div class="row between"><p class="small"><b>Marque só o que vai transferir</b></p>${nItens>1?'<button type="button" class="link small" data-act="trfTodos">Marcar todos</button>':''}</div>
<ul class="trf-lista">${r.unidades.map(id=>{const x=unid(id)||{pat:'?'};return `<li><input type="checkbox" name="u" value="${id}" id="tu_${id}" ${nItens===1?'checked':''}><label for="tu_${id}"><span class="mono">${esc(x.pat)}</span> <span class="small muted">${esc(tipo(x.tipoId).nome)}${x.serie?' · série '+esc(x.serie):''}</span></label></li>`;}).join('')}
${(r.municao||[]).map((x,k)=>`<li><input type="checkbox" name="m" value="${k}" id="tm_${k}" ${nItens===1?'checked':''}><label for="tm_${k}"><span class="small">${esc(tipo(x.tipoId).nome)} · lote ${esc(loteTxt(x))}</span><br><span class="small muted">com você: ${x.qtd} cart.</span></label><input class="i q" type="number" inputmode="numeric" min="1" max="${x.qtd}" name="mq_${k}" value="${x.qtd}" aria-label="Cartuchos a transferir"></li>`).join('')}</ul>
<p class="small muted" style="margin-top:.3rem">Na munição, ajuste quantos cartuchos vão para o colega.</p></div>
<label class="f"><span>Transferir para</span><select class="i" name="dest" required><option value="">Selecione o cadete…</option>${dest.map(x=>`<option value="${x.id}">${esc(nomeM(x.id))} – ${esc(x.pelotao)}</option>`).join('')}</select></label>
<p class="small muted">Depois você assina o pedido. O colega recebe no celular dele e precisa <b>aceitar e assinar</b>. Até lá, o material continua sob sua responsabilidade. O prazo de devolução continua o mesmo (${fmt(r.devolucao)}).</p>
<p class="erro" id="trf-erro"></p>
<button class="btn btn-pri btn-block">Continuar para assinar</button></form>`);
}
async function confirmarTransf(form,fd){
const r=R(form.dataset.id),u=me(),err=m=>{$('#trf-erro').textContent=m;};
if(!r||r.status!=='cautelada'||r.userId!==u.id){err('Esta cautela não está mais com você.');return;}
const sel=fd.getAll('u').filter(id=>r.unidades.includes(id));
const mun=[];for(const k of fd.getAll('m').map(Number)){const x=(r.municao||[])[k];if(!x)continue;const q=Number(fd.get('mq_'+k));
if(!Number.isInteger(q)||q<1||q>x.qtd){err(`${tipo(x.tipoId).nome}: informe de 1 a ${x.qtd} cartuchos.`);return;}mun.push({k,qtd:q});}
const d=D.users.find(x=>x.id===fd.get('dest'));
if(!sel.length&&!mun.length){err('Marque ao menos um item para transferir.');return;}
if(!d||d.perfil!=='aluno'||d.id===u.id){err('Escolha o cadete que vai receber.');return;}
const pats=sel.map(id=>(unid(id)||{pat:id}).pat).concat(mun.map(m=>`${m.qtd} cart. ${tipo(r.municao[m.k].tipoId).nome} – lote ${loteTxt(r.municao[m.k])}`));
pedirAssinatura({titulo:'Assinar pedido de transferência',rotulo:'Assinar pedido',
corpo:`<div class="ficha"><p>Para <b>${esc(nomeM(d.id))}</b></p><ul class="itens">${pats.map(t=>`<li><span>${esc(t)}</span></li>`).join('')}</ul></div>
<p class="aviso">Solicito a transferência do material acima. Ele continua sob minha responsabilidade até ${esc(nomeM(d.id))} aceitar e assinar o recebimento.</p>`,
dados:em=>`SICAM | Pedido de transferência da cautela ${nr(r.num)} | De ${nomeM(u.id)} para ${nomeM(d.id)} | ${pats.join(', ')} | ${em}`,
onOk:async ass=>{const rr=R(r.id);if(!rr||rr.status!=='cautelada'||rr.transferPara||rr.devAssCadete)throw {msg:'Esta cautela mudou de situação. Feche e confira.'};
await updateDoc(doc(db,'reservas',rr.id),{transferPara:d.id,transfer:{de:u.id,para:d.id,em:ass.em,unidades:sel,mun,assinatura:ass},
log:[...rr.log,{t:ass.em,a:'Transferência solicitada',por:u.id,obs:`Para ${nomeM(d.id)}: ${pats.join(', ')} – assinada ${FORMA[ass.metodo]||ass.metodo}`}]});
closeModal();toast(`Pedido enviado a ${nomeM(d.id)}. Ele precisa aceitar e assinar no celular dele.`);}});
}
async function cancelarTransf(id){
const r=R(id);if(!r||!r.transferPara)return;
if(!confirm(`Cancelar o pedido de transferência para ${nomeM(r.transferPara)}?`))return;
await updateDoc(doc(db,'reservas',r.id),{transferPara:null,transfer:null,log:[...r.log,entrada('Transferência cancelada',`Pedido para ${nomeM(r.transferPara)} cancelado`)]});
closeModal();toast('Pedido de transferência cancelado.');
}
const TI=id=>D.transfIn.find(x=>x.id===id);
const munPedido=tr=>Array.isArray(tr.mun)?tr.mun:(tr.munIdx||[]).map(k=>({k,qtd:null}));
const itensTransfer=r=>{const tr=r.transfer||{};const us=(tr.unidades||[]).filter(id=>(r.unidades||[]).includes(id));const mun=munPedido(tr).map(m=>{const x=(r.municao||[])[m.k];return x?{...x,qtd:m.qtd&&m.qtd<x.qtd?m.qtd:x.qtd}:null;}).filter(Boolean);return {us,mun};};
const liTransfer=r=>{const {us,mun}=itensTransfer(r);return us.map(id=>{const x=(r.uinfo||{})[id]||{pat:'?'};return `<li><span class="mono">${esc(x.pat)}</span><span>${esc(tipo(x.tipoId).nome)}${x.serie?` <span class="small muted">(série ${esc(x.serie)})</span>`:''}</span></li>`;}).join('')
+mun.map(x=>`<li><span class="mono">${x.qtd} cart.</span><span>${esc(tipo(x.tipoId).nome)} · lote ${esc(loteTxt(x))}</span></li>`).join('');};
function aceitarTransf(id){
const r=TI(id);if(!r)return;
pedirAssinatura({titulo:'Aceitar transferência – '+nr(r.num),sub:'Aceite só com o material na sua frente.',rotulo:'Aceitar e assinar',
corpo:`<div class="ficha"><p style="font-weight:600">De ${esc(nomeM(r.userId))}</p><ul class="itens">${liTransfer(r)}</ul>
<dl class="meta"><dt>Devolver até</dt><dd>${fmt(r.devolucao)}</dd></dl></div>
<p class="aviso">Declaro que recebi o material acima de ${esc(nomeM(r.userId))}, conferi os números e o estado de conservação, e me responsabilizo pela guarda e pela devolução até ${fmt(r.devolucao)}.</p>`,
dados:em=>{const {us,mun}=itensTransfer(r);return `SICAM | Aceite de transferência da cautela ${nr(r.num)} | De ${nomeM(r.userId)} para ${nomeM(sess.userId)} | ${us.map(x=>((r.uinfo||{})[x]||{pat:x}).pat).concat(mun.map(munTxt)).join(', ')} | ${em}`;},
onOk:ass=>efetivarAceite(r.id,ass)});
}
async function efetivarAceite(id,ass){
const eu=me(),ref=doc(collection(db,'reservas')),oref=doc(db,'reservas',id);let num=0;
await runTransaction(db,async tx=>{
const os=await tx.get(oref),cs=await tx.get(doc(db,'config','contador'));
const o=os.exists()?os.data():null;
if(!o||o.status!=='cautelada'||o.transferPara!==eu.id||!o.transfer)throw {msg:'O pedido mudou ou foi cancelado. Feche e confira de novo.'};
const tr=o.transfer,uAll=o.unidades||[],mAll=o.municao||[];
const sel=(tr.unidades||[]).filter(i=>uAll.includes(i)),resto=uAll.filter(i=>!sel.includes(i));
const mun=[],munResto=mAll.map(x=>({...x}));
for(const m of munPedido(tr)){const x=mAll[m.k];if(!x)continue;const q=m.qtd&&m.qtd<x.qtd?m.qtd:x.qtd;mun.push({...x,qtd:q});munResto[m.k].qtd-=q;}
const munFica=munResto.filter(x=>x.qtd>0);
if(!sel.length&&!mun.length)throw {msg:'Não há itens para transferir neste pedido.'};
const ui0=o.uinfo||{},uinfo={},uinfoResto={};sel.forEach(i=>{if(ui0[i])uinfo[i]=ui0[i];});resto.forEach(i=>{if(ui0[i])uinfoResto[i]=ui0[i];});
const itensDeInfo=(ids,mm)=>{const m={};ids.forEach(i=>{const x=ui0[i];if(x)m[x.tipoId]=(m[x.tipoId]||0)+1;});mm.forEach(x=>m[x.tipoId]=(m[x.tipoId]||0)+x.qtd);return Object.entries(m).map(([tipoId,qtd])=>({tipoId,qtd}));};
num=((cs.exists()&&cs.data().seq)||0)+1;
const de=o.userId,total=!resto.length&&!munFica.length,forma=FORMA[ass.metodo]||ass.metodo;
tx.update(doc(db,'config','contador'),{seq:num});
tx.set(ref,{num,userId:eu.id,itens:itensDeInfo(sel,mun),unidades:sel,municao:mun,uinfo,retirada:ass.em,devolucao:o.devolucao,finalidade:o.finalidade||'',
obs:`Recebida de ${nomeM(de)} (${nr(o.num)})`,status:'cautelada',origem:os.id,cond:{},criadoEm:ass.em,
transferencia:{de,em:ass.em,solicitadaEm:tr.em,assinaturaDe:tr.assinatura||null},assinatura:{...ass,contexto:'transferencia'},
log:[{t:ass.em,a:'Transferência',por:eu.id,obs:`De ${nomeM(de)} para ${nomeM(eu.id)} – pedido assinado por ${nomeM(de)} e aceite assinado por ${nomeM(eu.id)}, ${forma}`}]});
tx.update(oref,total?{status:'transferida',transferPara:null,transfer:null,log:[...(o.log||[]),{t:ass.em,a:'Transferida',por:eu.id,obs:`Para ${nomeM(eu.id)} (${nr(num)}) – aceite assinado no celular dele`}]}
:{unidades:resto,municao:munFica,uinfo:uinfoResto,itens:itensDeInfo(resto,munFica),transferPara:null,transfer:null,
log:[...(o.log||[]),{t:ass.em,a:'Transferência parcial',por:eu.id,obs:`Para ${nomeM(eu.id)} (${nr(num)}): ${sel.map(i=>(ui0[i]||{pat:i}).pat).concat(mun.map(munTxt)).join(', ')} – aceite assinado no celular dele`}]});
});
closeModal();toast(`Transferência aceita. A cautela ${nr(num)} agora está com você.`);
}
async function recusarTransf(id){
const r=TI(id);if(!r)return;
if(!confirm(`Recusar a transferência de ${nomeM(r.userId)}?`))return;
await updateDoc(doc(db,'reservas',r.id),{transferPara:null,transfer:null,log:[...(r.log||[]),entrada('Transferência recusada',`Recusada por ${nomeM(sess.userId)}`)]});
toast('Transferência recusada.');
}

/* ============ Painel do Furriel ============ */
const NAV=[['painel','Painel'],['solic','Solicitações'],['ativas','Cautelas ativas'],['material','Material'],['militares','Militares'],['hist','Histórico']];
function vAdmin(){
const v=ui.view||'painel';
const pend=D.reservas.filter(r=>r.status==='pendente').length;
const late=D.reservas.filter(atrasada).length;
const upend=D.users.filter(u=>u.pendente).length;
document.title=(pend?`(${pend}) `:'')+'SICAM – Furrielação';
const views={painel:vPainel,solic:vSolic,ativas:vAtivas,material:vMaterial,militares:vMilitares,hist:vHist};
return `<div class="shell"><nav class="side" aria-label="Menu do Furriel">
<div class="brand">${SEAL}<div><h1>SICAM</h1><p>Furrielação APMG</p></div></div>
${NAV.map(([k,l])=>`<button class="nav-b" data-act="go" data-v="${k}" ${v===k?'aria-current="page"':''}><span>${l}</span>${k==='solic'&&pend?`<span class="badge">${pend}</span>`:''}${k==='ativas'&&late?`<span class="badge red">${late}</span>`:''}${k==='militares'&&upend?`<span class="badge">${upend}</span>`:''}</button>`).join('')}
<div class="foot"><div class="who">${esc(nomeM(sess.userId))}</div>
${bioOk&&!temBioAqui()?'<button class="nav-b" data-act="ativarBio">Ativar digital / Face ID</button>':''}<button class="nav-b" data-act="senha">Trocar senha</button>
<button class="nav-b" data-act="sair">Sair</button></div>
</nav><main class="a-main">${views[v]()}</main></div>`;
}
function acoesAdmin(r,inModal){
const cls='btn'+(inModal?'':' btn-sm');
if(r.status==='pendente')return `<button class="${cls} btn-warn" data-act="recusar" data-id="${r.id}">Recusar</button><button class="${cls} btn-pri" data-act="aprovar" data-id="${r.id}">Aprovar</button>`;
if(r.status==='aprovada')return `<button class="${cls} btn-pri" data-act="separar" data-id="${r.id}">Separar material</button>`;
if(r.status==='separada')return r.assinatura?`<button class="${cls} btn-pri" data-act="confirmarEntrega" data-id="${r.id}">Confirmar entrega</button>`
:`<button class="${cls}" data-act="cautelar" data-id="${r.id}">Assinar no balcão</button>`;
if(r.status==='cautelada')return `<button class="${cls} btn-pri" data-act="devolver" data-id="${r.id}">${r.devAssCadete?'Conferir e assinar devolução':'Registrar devolução'}</button>`;
if(r.status==='transferida'&&inModal){const n=D.reservas.find(x=>x.origem===r.id);if(n)return `<button class="btn" data-act="ver" data-id="${n.id}">Ver cautela de destino</button>`;}
return inModal?`<button class="btn" data-act="fechar">Fechar</button>`:'';
}
function cardAdmin(r){
return `<div class="card">
<button class="clickable" style="background:none;border:0;padding:0" data-act="ver" data-id="${r.id}">
<div class="card-t"><div><span class="nr">${nr(r.num)}</span><p style="font-weight:600">${esc(nomeM(r.userId))}</p></div>${stamp(r)}</div>
${itensLi(r)}${['pendente','aprovada'].includes(r.status)?(r.itens||[]).map(i=>{const c=contagem(i.tipoId);return i.qtd>c.disponivel?`<p class="falta">⚠ ${esc(tipo(i.tipoId).nome)}: há ${c.disponivel} disponível(is) para ${i.qtd} pedido(s)</p>`:'';}).join(''):''}
<dl class="meta"><dt>Retirada</dt><dd>${fmt(r.retirada)}</dd><dt>Devolução</dt><dd class="${atrasada(r)?'c-stamp':''}">${fmt(r.devolucao)}</dd><dt>Finalidade</dt><dd>${esc(r.finalidade)}</dd></dl>
${r.status==='separada'?(r.assinatura?`<p class="small c-ok" style="margin-top:.5rem">Assinado pelo militar às ${fmt(r.assinatura.em)}, ${r.assinatura.metodo==='biometria'?'com digital/Face ID':'com senha'}.</p>`
:'<p class="small muted" style="margin-top:.5rem">Aguardando o militar assinar no celular.</p>'):''}
</button>
<div class="row" style="margin-top:.7rem;justify-content:flex-end">${acoesAdmin(r)}</div></div>`;
}
function vPainel(){
const Rs=D.reservas, c=s=>Rs.filter(r=>r.status===s).length;
const late=Rs.filter(atrasada).length;
const feed=Rs.flatMap(r=>(r.log||[]).map(l=>({...l,r}))).sort((a,b)=>b.t.localeCompare(a.t)).slice(0,8);
return `<div class="a-head"><div><h1>Painel</h1><p>${new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})}</p></div><div style="min-width:220px">${botaoAvisos()}</div></div>
<div class="kpis">
<button class="kpi" data-act="go" data-v="solic"><strong>${c('pendente')}</strong><span>aguardando aprovação</span></button>
<button class="kpi" data-act="go" data-v="solic"><strong>${c('aprovada')+c('separada')}</strong><span>a separar ou retirar</span></button>
<button class="kpi" data-act="go" data-v="ativas"><strong>${c('cautelada')}</strong><span>cautelas ativas</span></button>
<button class="kpi${late?' alert':''}" data-act="go" data-v="ativas"><strong>${late}</strong><span>com devolução em atraso</span></button>
</div>
<div class="two">
<section><div class="sec-h"><h2>Situação do material</h2></div>
${D.tipos.length?`<div class="tbl-wrap"><table><thead><tr><th>Material</th><th>Livre</th><th>Fora</th><th>Manut.</th><th style="width:40%">Distribuição</th></tr></thead><tbody>
${D.tipos.map(t=>{const k=contagem(t.id),p=x=>k.total?x/k.total*100:0;
if(k.mun)return `<tr><td>${esc(t.nome)}</td><td>${k.disponivel} cart.</td><td>${k.cautelado}</td><td>—</td><td><div class="bar"><i class="g-free" style="width:${p(k.disponivel)}%"></i><i class="g-res" style="width:${p(k.separado)}%"></i><i class="g-out" style="width:${p(k.cautelado)}%"></i></div></td></tr>`;
return `<tr><td>${esc(t.nome)}</td><td>${k.livre}/${k.total}</td><td>${k.cautelado}</td><td>${k.manutencao+k.extraviado}</td>
<td><div class="bar"><i class="g-free" style="width:${p(k.livre)}%"></i><i class="g-res" style="width:${p(k.reservado+k.separado)}%"></i><i class="g-out" style="width:${p(k.cautelado)}%"></i><i class="g-man" style="width:${p(k.manutencao+k.extraviado)}%"></i></div></td></tr>`;}).join('')}
</tbody></table></div>
<div class="legend"><span><i class="g-free"></i>Disponível</span><span><i class="g-res"></i>Reservado / separado</span><span><i class="g-out"></i>Cautelado</span><span><i class="g-man"></i>Manutenção / extraviado</span></div>`
:`<div class="empty"><p>Nenhum material cadastrado.</p><p style="margin-top:.6rem"><button class="btn btn-pri" data-act="go" data-v="material">Cadastrar material</button></p></div>`}
</section>
<section><div class="sec-h"><h2>Últimos registros</h2></div><div class="card"><ul class="feed">
${feed.map(l=>`<li><time>${fmt(l.t)}</time>${nr(l.r.num)} ${esc(l.a.toLowerCase())} – ${esc(nomeM(l.r.userId))}</li>`).join('')||'<li class="muted">Nenhum registro ainda.</li>'}
</ul></div></section>
</div>`;
}
function vSolic(){
const col=(s,t,help)=>{const l=D.reservas.filter(r=>r.status===s).sort((a,b)=>a.retirada.localeCompare(b.retirada));
return `<section class="col"><div class="col-h"><h3>${t}</h3><span class="tag">${l.length}</span></div>
${l.length?l.map(cardAdmin).join(''):`<div class="empty small">${help}</div>`}</section>`;};
return `<div class="a-head"><div><h1>Solicitações</h1><p>Cada pedido avança da esquerda para a direita. Ordenado pela hora de retirada.</p></div></div>
<div class="cols">${col('pendente','Aguardando aprovação','Nenhum pedido novo.')}${col('aprovada','Aprovadas – separar','Nada para separar.')}${col('separada','Prontas – retirada','Ninguém aguardando retirada.')}</div>`;
}
function vAtivas(){
const l=D.reservas.filter(r=>r.status==='cautelada').sort((a,b)=>a.devolucao.localeCompare(b.devolucao));
return `<div class="a-head"><div><h1>Cautelas ativas</h1><p>Material fora da Furrielação, pela ordem de devolução prevista.</p></div></div>
${l.length?`<div class="tbl-wrap"><table><thead><tr><th>Nº</th><th>Militar</th><th>Material</th><th>Patrimônios</th><th>Devolução</th><th>Situação</th><th></th></tr></thead><tbody>
${l.map(r=>`<tr class="hov" data-act="ver" data-id="${r.id}"><td class="mono">${nr(r.num)}</td><td>${esc(nomeM(r.userId))}${r.transferPara?`<br><span class="small c-brass">transferindo para ${esc(nomeM(r.transferPara))}</span>`:''}</td><td>${esc(itensTxt(r))}</td>
<td class="mono">${(r.unidades||[]).map(id=>esc(unid(id)?.pat||'')).join(', ')}</td><td class="${atrasada(r)?'c-stamp':''}">${fmt(r.devolucao)}</td><td>${stamp(r)}</td>
<td>${r.devAssCadete?'<span class="small c-ok">Militar assinou a devolução</span><br>':''}<button class="btn btn-sm btn-pri" data-act="devolver" data-id="${r.id}">${r.devAssCadete?'Conferir e assinar':'Registrar devolução'}</button></td></tr>`).join('')}</tbody></table></div>`
:'<div class="empty">Todo o material está na Furrielação.</div>'}`;
}
const CATS=['Armas de fogo','Munição','Armas brancas e cerimonial','Comunicação','Proteção individual','Contenção e ordem pública','Iluminação','Uniforme e intempérie','Outros'];
const normTxt=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const catOf=t=>t.mun?'Munição':(t.categoria||adivinhaCat(t.nome));
function adivinhaCat(nome){const n=' '+String(nome||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()+' ';
if(/pistola|revolver|carabina|fuzil|espingarda|submetralhadora|\bsmt\b|mosquet|metralhadora/.test(n))return 'Armas de fogo';
if(/espad/.test(n))return 'Armas brancas e cerimonial';
if(/\bht\b|radio|transceptor/.test(n))return 'Comunicação';
if(/capacete|colete|escudo|mascara|joelheira|cotoveleira|caneleira/.test(n))return 'Proteção individual';
if(/algema|tonfa|bastao|cone|espargidor|spray|incapacitacao|granada/.test(n))return 'Contenção e ordem pública';
if(/lanterna/.test(n))return 'Iluminação';
if(/capa|chuva|poncho|luva|bota|gandola/.test(n))return 'Uniforme e intempérie';
return 'Outros';}
function normCat(c,nome){const k=normTxt(c);if(!k)return adivinhaCat(nome);
const f=CATS.find(x=>normTxt(x)===k);if(f)return f;
const mapa={protecaobalistica:'Proteção individual',equipamentodeordempublica:'Contenção e ordem pública',menosletal:'Contenção e ordem pública',
uniformeintemperie:'Uniforme e intempérie',armamento:'Armas de fogo',armasdefogo:'Armas de fogo',armabranca:'Armas brancas e cerimonial',comunicacao:'Comunicação',iluminacao:'Iluminação',municao:'Munição',outros:'Outros'};
return mapa[k]||String(c).trim();}
function catsPresentes(tipos){const extra=[...new Set(tipos.map(catOf).filter(c=>!CATS.includes(c)))].sort();
return CATS.filter(c=>tipos.some(t=>catOf(t)===c)).concat(extra);}
const ordTipos=l=>[...l].sort((a,b)=>{const ca=CATS.indexOf(catOf(a)),cb=CATS.indexOf(catOf(b));return (ca<0?99:ca)-(cb<0?99:cb)||a.nome.localeCompare(b.nome,'pt-BR');});
const patTxt=u=>esc(u.pat)+(u.serie?` <span class="muted small">· série ${esc(u.serie)}</span>`:'');
const USTAT={disponivel:['Disponível','var(--ok)'],separado:['Separado','var(--brass)'],cautelado:['Cautelado','var(--blue)'],manutencao:['Manutenção','var(--stamp)'],extraviado:['Extraviado','var(--stamp)']};
function vMaterial(){
const cats=catsPresentes(D.tipos);
const bloco=t=>{const k=contagem(t.id);const us=D.unidades.filter(u=>u.tipoId===t.id);
return `<details class="tipo" data-tipo="${t.id}" ${ui.aberto===t.id?'open':''}><summary><div><h3>${esc(t.nome)}${t.oculto?' <span class="tag c-muted">oculto aos cadetes</span>':''}</h3><p class="small muted">${esc(t.desc||'')}</p></div>
<div class="row small"><span class="tag">${k.disponivel} disp.</span><span class="tag">${k.cautelado} caut.</span>${k.manutencao?`<span class="tag c-stamp">${k.manutencao} manut.</span>`:''}<span class="tag">${k.total} total</span></div></summary>
<div class="body"><div class="units">${us.map(u=>`<div class="unit"><span class="mono"><span class="dot" style="background:${(USTAT[u.status]||['','var(--muted)'])[1]}"></span>${patTxt(u)}</span>
${['separado','cautelado'].includes(u.status)?`<span class="small muted">${USTAT[u.status][0]}</span>`:
`<select data-chg="ustat" data-id="${u.id}" aria-label="Situação de ${esc(u.pat)}">${['disponivel','manutencao','extraviado'].map(s=>`<option value="${s}" ${u.status===s?'selected':''}>${USTAT[s][0]}</option>`).join('')}</select>`}</div>`).join('')}</div>
<div class="row" style="margin-top:.8rem"><button class="btn btn-sm" data-act="novaUnid" data-id="${t.id}">Adicionar unidade</button><button class="btn btn-sm" data-act="editTipo" data-id="${t.id}">Editar material</button></div></div></details>`;};
return `<div class="a-head"><div><h1>Material</h1><p>${D.tipos.length} tipos e ${D.unidades.length} unidades, organizados por categoria.</p></div>
<div class="row"><button class="btn" data-act="importar">Importar planilha</button><button class="btn" data-act="novoMun">Cadastrar munição</button><button class="btn btn-pri" data-act="novoTipo">Cadastrar material</button></div></div>
<div class="filters"><input class="i" type="search" style="flex:1" placeholder="Buscar por nº de série, patrimônio, lote ou nome" value="${esc(ui.mq||'')}" data-inp="mq" aria-label="Buscar material"></div>
<div id="mat-res">${ui.mq&&ui.mq.trim()?matBusca():cats.map(c=>{const l=ordTipos(D.tipos.filter(t=>catOf(t)===c));return `<h2 class="cat-h">${esc(c)}<span class="muted small">${l.length} ${l.length>1?'tipos':'tipo'}</span></h2>${l.map(t=>t.mun?vMunTipo(t):bloco(t)).join('')}`;}).join('')
||'<div class="empty"><p>Nenhum material cadastrado.</p><p style="margin-top:.6rem">Importe a planilha da Furrielação ou cadastre um a um.</p></div>'}</div>`;
}
const comQuem=id=>D.reservas.find(r=>['separada','cautelada'].includes(r.status)&&(r.unidades||[]).includes(id));
function matBusca(){
const q=normTxt(ui.mq);
const us=D.unidades.filter(u=>normTxt(u.pat+' '+(u.serie||'')+' '+tipo(u.tipoId).nome).includes(q)).slice(0,200);
const ls=D.lotes.filter(l=>normTxt('lote '+l.lote+' '+tipo(l.tipoId).nome).includes(q));
if(!us.length&&!ls.length)return '<div class="empty">Nenhum material encontrado.</div>';
return `<div class="tbl-wrap"><table><thead><tr><th>Patrimônio / lote</th><th>Nº de série</th><th>Material</th><th>Situação</th><th>Com quem</th></tr></thead><tbody>
${us.map(u=>{const r=comQuem(u.id);return `<tr><td class="mono">${esc(u.pat)}</td><td class="mono">${esc(u.serie||'—')}</td><td>${esc(tipo(u.tipoId).nome)}</td>
<td><span class="dot" style="background:${(USTAT[u.status]||['','var(--muted)'])[1]}"></span>${(USTAT[u.status]||[u.status])[0]}</td>
<td>${r?`<button class="link" data-act="ver" data-id="${r.id}">${esc(nomeM(r.userId))} · ${nr(r.num)}</button>`:'—'}</td></tr>`;}).join('')}
${ls.map(l=>{const rs=D.reservas.filter(r=>['separada','cautelada'].includes(r.status)&&(r.municao||[]).some(x=>x.loteId===l.id));
return `<tr><td class="mono">Lote ${esc(l.lote)}</td><td>—</td><td>${esc(tipo(l.tipoId).nome)}</td><td>${l.qtd} cart. em estoque</td>
<td>${rs.map(r=>`<button class="link" data-act="ver" data-id="${r.id}">${esc(nomeM(r.userId))} · ${nr(r.num)}</button>`).join('<br>')||'—'}</td></tr>`;}).join('')}
</tbody></table></div>`;
}
function vMunTipo(t){
const k=contagem(t.id);
return `<details class="tipo" data-tipo="${t.id}" ${ui.aberto===t.id?'open':''}><summary><div><h3>${esc(t.nome)}${t.oculto?' <span class="tag c-muted">oculto aos cadetes</span>':''}</h3><p class="small muted">${esc(t.desc||'')} · até ${t.limite||100} cartuchos por pedido</p></div>
<div class="row small"><span class="tag">${k.disponivel} em estoque</span>${k.separado?`<span class="tag">${k.separado} separ.</span>`:''}<span class="tag">${k.cautelado} caut.</span></div></summary>
<div class="body"><div class="tbl-wrap"><table><thead><tr><th>Lote</th><th>Em estoque</th><th>Fora</th><th></th></tr></thead><tbody>
${lotesDe(t.id).map(l=>{const fora=D.reservas.filter(r=>['separada','cautelada'].includes(r.status)).reduce((a,r)=>a+(r.municao||[]).filter(x=>x.loteId===l.id).reduce((b,x)=>b+x.qtd,0),0);
return `<tr><td class="mono">${esc(l.lote)}</td><td>${l.qtd}</td><td>${fora||'—'}</td><td><button class="btn btn-sm" data-act="ajLote" data-id="${l.id}">Ajustar</button></td></tr>`;}).join('')||'<tr><td colspan="4" class="muted">Nenhum lote cadastrado.</td></tr>'}
</tbody></table></div>
<div class="row" style="margin-top:.8rem"><button class="btn btn-sm btn-pri" data-act="entMun" data-id="${t.id}">Entrada de munição</button><button class="btn btn-sm" data-act="editMun" data-id="${t.id}">Editar calibre</button></div>
${lotesDe(t.id).some(l=>(l.movs||[]).length)?`<ul class="outros"><li><b>Últimas movimentações</b></li>${lotesDe(t.id).flatMap(l=>(l.movs||[]).map(m=>({...m,lote:l.lote}))).sort((a,b)=>b.t.localeCompare(a.t)).slice(0,6).map(m=>`<li>${fmt(m.t)} · ${esc(m.tipo)} · lote ${esc(m.lote)} · ${m.tipo==='Entrada'?'+':''}${m.qtd} cart.${m.obs?' – '+esc(m.obs):''} (${esc(nomeM(m.por))})</li>`).join('')}</ul>`:''}
</div></details>`;
}
function formMun(t){
openModal(t?'Editar calibre':'Cadastrar munição',`<form id="f-mun" data-id="${t?t.id:''}" class="stack" autocomplete="off">
<label class="f"><span>Calibre / nome</span><input class="i" name="nome" required value="${esc(t?t.nome:'')}" placeholder="Ex.: CBC 9mm Luger"></label>
<label class="f"><span>Descrição (opcional)</span><input class="i" name="desc" value="${esc(t&&t.desc||'')}" placeholder="Ex.: ETOG 124 gr"></label>
<label class="f"><span>Limite de cartuchos por pedido</span><input class="i" name="lim" type="number" min="1" max="5000" required value="${t?t.limite||100:100}"></label>
${t?'':`<div class="grid2"><label class="f"><span>Lote inicial</span><input class="i mono" name="lote" required></label>
<label class="f"><span>Quantidade (cartuchos)</span><input class="i" name="q" type="number" min="0" required value="0"></label></div>`}
<label class="check"><input type="checkbox" name="vis" ${t&&t.oculto?'':'checked'}><span>Mostrar esta munição para os cadetes solicitarem</span></label>
<p class="small muted">O limite por pedido é o máximo que o cadete pode pedir de uma vez. Ele não revela o estoque.</p>
<button class="btn btn-pri btn-block">${t?'Salvar':'Cadastrar'}</button></form>`);
}
function formEntrada(t){
openModal('Entrada de munição',`<form id="f-ent" data-id="${t.id}" class="stack" autocomplete="off">
<label class="f"><span>Lote</span><input class="i mono" name="lote" required list="lotes-${t.id}" placeholder="Nº do lote"><datalist id="lotes-${t.id}">${lotesDe(t.id).map(l=>`<option value="${esc(l.lote)}">`).join('')}</datalist></label>
<label class="f"><span>Quantidade recebida (cartuchos)</span><input class="i" name="q" type="number" min="1" required></label>
<label class="f"><span>Documento / origem (opcional)</span><input class="i" name="obs" placeholder="Ex.: Guia de remessa nº 123/2026"></label>
<button class="btn btn-pri btn-block">Registrar entrada</button></form>`,'',esc(t.nome));
}
function formAjuste(l){
openModal('Ajustar estoque do lote',`<form id="f-aj" data-id="${l.id}" class="stack">
<p>${esc(tipo(l.tipoId).nome)} · lote <span class="mono">${esc(l.lote)}</span> · hoje: <b>${l.qtd}</b> cart. em estoque</p>
<label class="f"><span>Quantidade correta em estoque</span><input class="i" name="q" type="number" min="0" required value="${l.qtd}"></label>
<label class="f"><span>Motivo (fica registrado)</span><input class="i" name="obs" required placeholder="Ex.: conferência do paiol"></label>
<button class="btn btn-pri btn-block">Salvar ajuste</button></form>`);
}
function vMilitares(){
const pend=D.users.filter(u=>u.pendente);
const blocoPend=pend.length?`<div class="sec-h"><h2>Aguardando liberação</h2><span class="tag c-brass">${pend.length}</span></div>
<div class="tbl-wrap" style="margin-bottom:1.4rem"><table><thead><tr><th>Nome</th><th>Nº</th><th>Pelotão</th><th>E-mail</th><th>Pedido em</th><th></th></tr></thead><tbody>
${pend.map(u=>`<tr><td>${esc(nomeM(u.id))}</td><td class="mono">${esc(u.login)}</td><td>${esc(u.pelotao)}</td><td>${esc(u.email||'')}</td><td>${fmt(u.criadoEm)}</td>
<td><div class="row" style="flex-wrap:nowrap"><button class="btn btn-sm btn-warn" data-act="recusarUser" data-id="${u.id}">Recusar</button><button class="btn btn-sm btn-pri" data-act="liberar" data-id="${u.id}">Liberar</button></div></td></tr>`).join('')}
</tbody></table></div><div class="sec-h"><h2>Com acesso</h2></div>`:'';
const l=[...D.users].filter(u=>!u.pendente).sort((a,b)=>(a.perfil===b.perfil?0:a.perfil==='furriel'?-1:1)||a.nome.localeCompare(b.nome));
return `<div class="a-head"><div><h1>Militares</h1><p>Os militares se cadastram pelo app. Aqui você libera o acesso.</p></div><button class="btn" data-act="novoUser">Cadastrar manualmente</button></div>
${blocoPend}<div class="tbl-wrap"><table><thead><tr><th>Nome</th><th>E-mail / usuário</th><th>Pelotão</th><th>Perfil</th><th>Cautelas ativas</th><th></th></tr></thead><tbody>
${l.map(u=>{const at=D.reservas.filter(r=>r.userId===u.id&&r.status==='cautelada').length;
return `<tr><td>${esc(nomeM(u.id))}${u.ativo?'':' <span class="tag c-muted">desativado</span>'}</td><td class="small">${esc(u.email||u.login)}</td><td>${esc(u.pelotao)}</td>
<td>${u.perfil==='furriel'?'Furriel':'Solicitante'}</td><td>${at||'—'}</td>
<td>${u.id===sess.userId?'':`<button class="btn btn-sm" data-act="toggleUser" data-id="${u.id}">${u.ativo?'Desativar':'Reativar'}</button>`}</td></tr>`;}).join('')}
</tbody></table></div>
<p class="small muted" style="margin-top:.8rem">Se um militar esquecer a senha, ele mesmo usa "Esqueci minha senha" na tela de entrada e recebe o link no e-mail institucional.</p>`;
}
function histFiltrado(){
const q=ui.q.trim().toLowerCase();
return D.reservas.filter(r=>(ui.fs==='todos'||(ui.fs==='atraso'?atrasada(r):r.status===ui.fs))&&
(!q||(nomeM(r.userId)+' '+itensTxt(r)+' '+nr(r.num)+' '+(r.unidades||[]).map(id=>{const x=unid(id);return x?x.pat+' '+(x.serie||''):'';}).join(' ')+' '+(r.municao||[]).map(loteTxt).join(' ')).toLowerCase().includes(q)))
.sort((a,b)=>b.num-a.num);
}
function vHist(){
return `<div class="a-head"><div><h1>Histórico</h1><p>Todas as solicitações e cautelas registradas.</p></div><div class="row"><button class="btn" data-act="relPDF" data-escopo="hist">Relatório PDF</button><button class="btn" data-act="relXLS" data-escopo="hist">Relatório Excel</button></div></div>
<p class="small muted" style="margin:-.6rem 0 .8rem">Os relatórios seguem a busca e o filtro abaixo – por exemplo, digite o nome de um militar para gerar só o histórico dele.${histTudo?' Histórico completo carregado.':` Aparecem as cautelas em andamento e as dos últimos ${JANELA_DIAS} dias. <button class="link" data-act="histTudo">Carregar histórico completo</button>`}</p>
<div class="filters"><input class="i" type="search" placeholder="Buscar militar, material, patrimônio, série ou lote" value="${esc(ui.q)}" data-inp="q" aria-label="Buscar">
<select class="i" data-chg="fs" aria-label="Filtrar situação"><option value="todos">Todas as situações</option>${Object.entries(ST).map(([k,[t]])=>`<option value="${k}" ${ui.fs===k?'selected':''}>${t}</option>`).join('')}<option value="atraso" ${ui.fs==='atraso'?'selected':''}>Em atraso</option></select></div>
<div id="hist-t">${tabHist(histFiltrado())}</div>`;
}
function tabHist(l){
return l.length?`<div class="tbl-wrap"><table><thead><tr><th>Nº</th><th>Militar</th><th>Material</th><th>Retirada</th><th>Devolução</th><th>Situação</th></tr></thead><tbody>
${l.map(r=>`<tr class="hov" data-act="ver" data-id="${r.id}"><td class="mono">${nr(r.num)}</td><td>${esc(nomeM(r.userId))}</td><td>${esc(itensTxt(r))}</td><td>${fmt(r.retirada)}</td><td>${fmt(r.devolucao)}</td><td>${stamp(r)}</td></tr>`).join('')}
</tbody></table></div>`:'<div class="empty">Nenhum registro com esse filtro.</div>';
}
/* ============ Ações do Furriel ============ */
const R=id=>D.reservas.find(x=>x.id===id);
async function aprovar(id){const r=R(id);if(!r||r.status!=='pendente')return;
await updateDoc(doc(db,'reservas',id),{status:'aprovada',log:[...r.log,entrada('Aprovada')]});closeModal();toast(`${nr(r.num)} aprovada. Próximo passo: separar o material.`);}
function recusar(id){
const r=R(id);if(!r)return;
openModal('Recusar '+nr(r.num),`<form id="f-rec" data-id="${r.id}" class="stack"><p>${esc(nomeM(r.userId))} – ${esc(itensTxt(r))}</p>
<label class="f"><span>Motivo (o militar verá esta mensagem)</span><textarea class="i" name="m" required placeholder="Ex.: material já destinado à instrução do 2º Pelotão"></textarea></label>
<button class="btn btn-warn btn-block">Recusar solicitação</button></form>`);
}
function separar(id){
const r=R(id);if(!r)return;
let body=`<form id="f-sep" data-id="${r.id}">
<div class="busca"><label class="sep-lbl" for="sep-q">🔎 Pesquisar material pelo nº de série, nº de patrimônio ou nome</label>
<input class="i" type="search" id="sep-q" placeholder="Ex.: HT-003, 2405512 ou pistola" aria-label="Pesquisar material" autocomplete="off" enterkeyhint="done">
<ul class="sep-res" id="sep-res" hidden></ul>
<div class="row between small" style="margin-top:.4rem"><span class="muted">Toque em "Selecionar" no resultado (ou Enter). Funciona com leitor de código de barras.</span><button type="button" class="link" data-act="sepAuto">Marcar automaticamente</button></div></div>`;
for(const i of r.itens){
const tn=tipo(i.tipoId).nome;
if(isMun(i.tipoId)){
const ls=lotesDe(i.tipoId).filter(l=>l.qtd>0);
body+=`<h3 style="margin-top:.9rem">${esc(tn)} <span class="cnt" data-cntm="${i.tipoId}">0 de ${i.qtd} cart.</span></h3>
<div class="lotes" data-mun="${i.tipoId}" data-q="${i.qtd}">${ls.map(l=>`<label class="lote-row" data-s="${esc(normTxt('lote '+l.lote+' '+tn))}" data-lote="${esc(normTxt(l.lote))}"><span><span class="mono">Lote ${esc(l.lote)}</span><span class="ser">${l.qtd} cart. em estoque</span></span>
<input class="i" type="number" inputmode="numeric" min="0" max="${Math.min(l.qtd,i.qtd)}" step="1" data-lid="${l.id}" data-max="${l.qtd}" placeholder="0" aria-label="Cartuchos do lote ${esc(l.lote)}"></label>`).join('')||'<p class="c-stamp small">Sem estoque deste calibre.</p>'}</div>`;
continue;}
const disp=D.unidades.filter(u=>u.tipoId===i.tipoId&&u.status==='disponivel');
body+=`<h3 style="margin-top:.9rem">${esc(tn)} <span class="cnt" data-cnt="${i.tipoId}">0 de ${i.qtd}</span></h3>
<div class="pick" data-tipo="${i.tipoId}" data-q="${i.qtd}">${disp.map(u=>`<label data-s="${esc(normTxt(u.pat+' '+(u.serie||'')+' '+tn))}" data-pat="${esc(normTxt(u.pat))}" data-serie="${esc(normTxt(u.serie||''))}"><input type="checkbox" name="u" value="${u.id}"><span class="mono">${esc(u.pat)}${u.serie?`<span class="ser">${esc(u.serie)}</span>`:''}</span></label>`).join('')||'<p class="c-stamp small">Nenhuma unidade disponível.</p>'}</div>`;
}
body+=`<p class="small muted">Se não houver o suficiente, marque o que existe: a solicitação fica registrada como atendida parcialmente.</p>
<p class="erro" id="sep-erro"></p><button class="btn btn-pri btn-block">Confirmar separação</button></form>`;
openModal('Separar material – '+nr(r.num),body,'',esc(nomeM(r.userId))+' · retirada '+fmt(r.retirada));
const q=$('#sep-q');if(q)q.focus();
}
function sepContar(){
document.querySelectorAll('#f-sep .lotes').forEach(g=>{const n=[...g.querySelectorAll('input')].reduce((a,x)=>a+(parseInt(x.value,10)||0),0),q=+g.dataset.q,c=document.querySelector(`[data-cntm="${g.dataset.mun}"]`);
if(c){c.textContent=`${n} de ${q} cart.`;c.classList.toggle('full',n===q);}});
document.querySelectorAll('#f-sep .pick').forEach(g=>{const n=g.querySelectorAll('input:checked').length,q=+g.dataset.q,c=document.querySelector(`[data-cnt="${g.dataset.tipo}"]`);
if(c){c.textContent=`${n} de ${q}`;c.classList.toggle('full',n===q);}});
}
function sepFiltrar(txt){
const q=normTxt(txt);
document.querySelectorAll('#f-sep .lotes label').forEach(l=>{l.hidden=!!q&&!l.dataset.s.includes(q)&&!(parseInt(l.querySelector('input').value,10)>0);});
document.querySelectorAll('#f-sep .pick label').forEach(l=>{l.hidden=!!q&&!l.dataset.s.includes(q)&&!l.querySelector('input').checked;});
}
function sepResultados(txt){
const box=$('#sep-res');if(!box)return;const q=normTxt(txt);
if(!q){box.hidden=true;box.innerHTML='';return;}
const us=[...document.querySelectorAll('#f-sep .pick label')].filter(l=>l.dataset.s.includes(q));
const ls=[...document.querySelectorAll('#f-sep .lotes label')].filter(l=>l.dataset.s.includes(q));
let h=us.slice(0,8).map(l=>{const inp=l.querySelector('input'),u=unid(inp.value)||{pat:'?'};const g=l.closest('.pick');
return `<li><span><span class="mono">${esc(u.pat)}</span>${u.serie?` <span class="small muted">· série ${esc(u.serie)}</span>`:''}<br><span class="small muted">${esc(tipo(g.dataset.tipo).nome)}</span></span>
${inp.checked?`<span class="row"><span class="small c-ok">Selecionado ✓</span><button type="button" class="btn btn-sm btn-warn" data-act="sepRm" data-id="${inp.value}">Remover</button></span>`:`<button type="button" class="btn btn-sm btn-pri" data-act="sepSel" data-id="${inp.value}">Selecionar</button>`}</li>`;}).join('');
h+=ls.slice(0,4).map(l=>{const i=l.querySelector('input'),lt=loteDe(i.dataset.lid)||{};return `<li><span><span class="mono">Lote ${esc(lt.lote||'')}</span><br><span class="small muted">${esc(tipo(lt.tipoId).nome)} · ${lt.qtd} cart. em estoque</span></span><button type="button" class="btn btn-sm" data-act="sepLote" data-id="${i.dataset.lid}">Informar quantidade</button></li>`;}).join('');
if(!h){const u=D.unidades.find(x=>normTxt(x.pat)===q||normTxt(x.serie||'')===q);const r=u&&comQuem(u.id);
h=`<li class="small">${u?`${esc(u.pat)} (${esc(tipo(u.tipoId).nome)}) não está disponível: ${esc((USTAT[u.status]||[u.status])[0].toLowerCase())}${r?' com '+esc(nomeM(r.userId)):''}.`:'Nenhum material disponível deste pedido corresponde à pesquisa.'}</li>`;}
box.innerHTML=h;box.hidden=false;
}
function sepSelecionar(id){
const inp=document.querySelector(`#f-sep .pick input[value="${id}"]`);if(!inp)return;const g=inp.closest('.pick'),e=$('#sep-erro');e.textContent='';
if(!inp.checked&&g.querySelectorAll('input:checked').length>=+g.dataset.q){e.textContent=`Já foram marcados ${g.dataset.q} de ${tipo(g.dataset.tipo).nome}. Desmarque um para trocar.`;return;}
inp.checked=true;const q=$('#sep-q');if(q){q.value='';q.focus();}sepFiltrar('');sepResultados('');sepContar();
toast(`${(unid(id)||{pat:''}).pat} selecionado.`);
}
function sepEnter(inp){
const q=normTxt(inp.value),e=$('#sep-erro');e.textContent='';if(!q)return;
const lts=[...document.querySelectorAll('#f-sep .lotes label')];
const lt=lts.find(l=>l.dataset.lote===q)||(()=>{const v=lts.filter(l=>!l.hidden&&l.dataset.s.includes(q));return v.length===1&&!document.querySelectorAll('#f-sep .pick label:not([hidden])').length?v[0]:null;})();
if(lt){const i=lt.querySelector('input');i.focus();try{i.select();}catch(x){}return;}
const vis=[...document.querySelectorAll('#f-sep .pick label')].filter(l=>!l.hidden&&!l.querySelector('input').checked);
const alvo=vis.find(l=>l.dataset.pat===q||l.dataset.serie===q)||(vis.length===1?vis[0]:null);
if(!alvo){
const u=D.unidades.find(x=>normTxt(x.pat)===q||normTxt(x.serie||'')===q);
const jaMarcado=[...document.querySelectorAll('#f-sep .pick label')].some(l=>(l.dataset.pat===q||l.dataset.serie===q)&&l.querySelector('input').checked);
const r=u&&comQuem(u.id);
e.textContent=jaMarcado?'Esse item já está marcado.':u?`${u.pat} (${tipo(u.tipoId).nome}) não pode ser separado: ${(USTAT[u.status]||[u.status])[0].toLowerCase()}${r?' com '+nomeM(r.userId):''}.`
:vis.length?'Mais de um item corresponde. Digite o número completo ou toque no item.':'Nenhum item disponível corresponde a essa busca.';
return;}
const g=alvo.closest('.pick');
if(g.querySelectorAll('input:checked').length>=+g.dataset.q){e.textContent=`Já foram marcados ${g.dataset.q} de ${tipo(g.dataset.tipo).nome}.`;return;}
alvo.querySelector('input').checked=true;inp.value='';sepFiltrar('');sepResultados('');sepContar();alvo.scrollIntoView({block:'nearest'});
}
async function confirmarSeparacao(form){
const r=R(form.dataset.id);const sel=[],novos=[],mun=[];let parcial=false;const err=m=>{$('#sep-erro').textContent=m;};
for(const g of form.querySelectorAll('.pick')){
const ch=[...g.querySelectorAll('input:checked')].map(x=>x.value),q=+g.dataset.q;
if(ch.length>q){err(`Em ${tipo(g.dataset.tipo).nome}, marque no máximo ${q}.`);return;}
if(ch.length<q)parcial=true;if(ch.length)novos.push({tipoId:g.dataset.tipo,qtd:ch.length});
sel.push(...ch);
}
for(const g of form.querySelectorAll('.lotes')){
const q=+g.dataset.q,tn=tipo(g.dataset.mun).nome;let tot=0;
for(const x of g.querySelectorAll('input')){
const v=x.value.trim()===''?0:Number(x.value),l=loteDe(x.dataset.lid);
if(!Number.isInteger(v)||v<0){err(`${tn}: informe números inteiros de cartuchos.`);x.focus();return;}
if(v>l.qtd){err(`${tn}: o lote ${l.lote} tem só ${l.qtd} cartuchos.`);x.focus();return;}
if(v){tot+=v;mun.push({tipoId:g.dataset.mun,loteId:l.id,lote:l.lote,qtd:v});}
}
if(tot>q){err(`${tn}: foram pedidos ${q} cartuchos; você informou ${tot}.`);return;}
if(tot<q)parcial=true;if(tot)novos.push({tipoId:g.dataset.mun,qtd:tot});
}
for(const g of form.querySelectorAll('.lotes:empty, .pick:empty'))parcial=true;
if(!sel.length&&!mun.length){err('Marque ao menos uma unidade ou informe a munição. Se não houver nada disponível, recuse a solicitação.');return;}
const uinfo={};sel.forEach(id=>{const x=infoUnid(id);if(x)uinfo[id]=x;});
const upd={status:'separada',unidades:sel,municao:mun,uinfo,log:[...r.log,entrada('Separada',parcial?'Atendida parcialmente':'')]};
if(parcial){upd.itensSol=r.itens;upd.itens=novos;}
try{
await runTransaction(db,async tx=>{
const snaps=await Promise.all(sel.map(id=>tx.get(doc(db,'unidades',id))));
const lsn=await Promise.all(mun.map(x=>tx.get(doc(db,'lotes',x.loteId))));
if(snaps.some(s=>!s.exists()||s.data().status!=='disponivel'))throw {code:'mudou'};
const somas={};mun.forEach((x,k)=>{somas[x.loteId]=(somas[x.loteId]||0)+x.qtd;});
const lotesLidos={};lsn.forEach((s,k)=>{lotesLidos[mun[k].loteId]=s;});
for(const [lid,qt] of Object.entries(somas)){const s=lotesLidos[lid];if(!s.exists()||(s.data().qtd||0)<qt)throw {code:'mudou'};}
sel.forEach(id=>tx.update(doc(db,'unidades',id),{status:'separado'}));
for(const [lid,qt] of Object.entries(somas))tx.update(doc(db,'lotes',lid),{qtd:(lotesLidos[lid].data().qtd||0)-qt});
tx.update(doc(db,'reservas',r.id),upd);
});
}catch(e){if(e&&e.code==='mudou'){err('O estoque acabou de mudar. Feche e abra de novo.');return;}throw e;}
closeModal();toast(parcial?`${nr(r.num)} separada parcialmente. O militar já vê o que foi separado.`:`${nr(r.num)} separada. O militar já vê que o material está pronto.`);
}
function cautelar(id){
const r=R(id);if(!r)return;
openModal('Assinar no balcão – '+nr(r.num),`<form id="f-caut" data-id="${r.id}" class="stack" autocomplete="off">
<div class="ficha"><p style="font-weight:600">${esc(nomeM(r.userId))}</p><p class="small muted">${esc(user(r.userId).pelotao)}</p>
<ul class="itens">${r.unidades.map(uid=>{const u=unid(uid)||{pat:'?'};return `<li><span class="mono">${esc(u.pat)}</span><span>${esc(tipo(u.tipoId).nome)}${u.serie?` <span class="small muted">(série ${esc(u.serie)})</span>`:''}</span></li>`;}).join('')}${munLi(r)}</ul>
<dl class="meta"><dt>Devolver até</dt><dd>${fmt(r.devolucao)}</dd></dl></div>
<p class="small">Use só se o militar estiver sem celular. Ele confere o material na sua frente e digita a própria senha aqui. Isso vale como assinatura dele e como sua confirmação da entrega.</p>
<label class="f"><span>Senha de ${esc(nomeM(r.userId))}</span><input class="i" type="password" name="s" required autocomplete="new-password"></label>
<p class="erro" id="caut-erro"></p>
<button class="btn btn-pri btn-block">Assinar e entregar material</button></form>`);
}
function textoAssinatura(r,em){
const us=(r.unidades||[]).map(id=>{const u=unid(id)||{pat:id};return u.pat+(u.serie?'/'+u.serie:'');}).concat((r.municao||[]).map(munTxt)).join(', ');
return `SICAM | Cautela ${nr(r.num)} | ${nomeM(r.userId)} | Material: ${us} | Devolução até ${fmt(r.devolucao)} | Assinado em ${em}`;
}
/* ============ Assinatura: senha do SICAM, ou digital / Face ID / senha do celular ============ */
let assPend=null;
let bioRecente=null;
const temBioAqui=()=>{const u=me();const id=u&&bioLocal(u.id);return !!(bioOk&&id&&((u.passkeys||[]).some(k=>k.id===id)||bioRecente===id));};
const FORMA={senha:'com a senha do SICAM',biometria:'com digital, Face ID ou senha do celular',balcao:'com senha no aparelho da Furrielação'};
function blocoAssinatura(rot){
const bio=temBioAqui();
return `<div class="ass-box">
${bio?`<button type="button" class="btn btn-pri btn-block" data-act="assBio">👆 ${rot} com digital, Face ID ou senha do celular</button><p class="ou">ou</p>`:''}
<form id="f-ass" class="stack" autocomplete="off">
<label class="f"><span>${bio?'Senha do SICAM':'Sua senha do SICAM'}</span><input class="i" type="password" name="s" required autocomplete="current-password"></label>
<p class="erro" id="ass-erro"></p>
<button class="btn ${bio?'':'btn-pri '}btn-block">${rot} com senha</button></form>
${bioOk&&!bio?`<p class="small muted" style="margin-top:.6rem">Quer assinar com digital, Face ID ou a senha do celular? <button type="button" class="link" data-act="ativarBioAqui">Ative neste aparelho</button> (só uma vez).</p>`:''}
</div>`;
}
function pedirAssinatura(o){assPend=o;openModal(o.titulo,o.corpo+blocoAssinatura(o.rotulo||'Assinar'),'',o.sub||'');}
async function hashTexto(t){return b64u(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t)));}
async function concluirAssinatura(ass){
const p=assPend;if(!p)return;
try{await p.onOk(ass);}catch(e){console.error(e);const el=$('#ass-erro');if(el)el.textContent=e&&e.msg?e.msg:erroFirebase(e);return;}
}
async function assinarComSenha(fd){
const a=auth.currentUser,err=m=>{const el=$('#ass-erro');if(el)el.textContent=m;};
try{await reauthenticateWithCredential(a,EmailAuthProvider.credential(a.email,String(fd.get('s'))));}
catch(e){err((e.code==='auth/invalid-credential'||e.code==='auth/wrong-password')?'Senha incorreta.':erroFirebase(e));return;}
const em=nowISO(),dados=assPend.dados(em);
await concluirAssinatura({por:sess.userId,em,metodo:'senha',dados,hash:await hashTexto(dados),aparelho:navigator.userAgent.slice(0,160)});
}
async function assinarComBio(){
const credId=bioLocal(sess.userId);if(!assPend||!credId)return;
const em=nowISO(),dados=assPend.dados(em),h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(dados));
let a;
try{a=await navigator.credentials.get({publicKey:{challenge:h,rpId:location.hostname,allowCredentials:[{type:'public-key',id:ub64u(credId)}],userVerification:'required',timeout:60000}});}
catch(e){const el=$('#ass-erro');if(el)el.textContent='A digital, o Face ID ou a senha do celular não foram confirmados. Tente de novo ou use a senha do SICAM.';return;}
await concluirAssinatura({por:sess.userId,em,metodo:'biometria',dados,hash:b64u(h),credId:a.id,
authData:b64u(a.response.authenticatorData),clientData:b64u(a.response.clientDataJSON),sig:b64u(a.response.signature),aparelho:navigator.userAgent.slice(0,160)});
}
const fichaItens=r=>`<ul class="itens">${(r.unidades||[]).map(uid=>{const x=unid(uid)||(r.uinfo||{})[uid]||{pat:'?'};return `<li><span class="mono">${esc(x.pat)}</span><span>${esc(tipo(x.tipoId).nome)}${x.serie?` <span class="small muted">(série ${esc(x.serie)})</span>`:''}</span></li>`;}).join('')}${munLi(r)}</ul>`;
function assinar(id){
const r=R(id);if(!r||r.status!=='separada'||r.assinatura)return;
pedirAssinatura({titulo:'Assinar retirada – '+nr(r.num),sub:'Assine só com o material na sua frente.',rotulo:'Assinar retirada',
corpo:`<div class="ficha"><p style="font-weight:600">${esc(nomeM(r.userId))}</p>${fichaItens(r)}<dl class="meta"><dt>Devolver até</dt><dd>${fmt(r.devolucao)}</dd></dl></div>
<p class="aviso">Declaro que recebi o material acima, conferi os números e o estado de conservação, e me responsabilizo pela guarda e pela devolução até ${fmt(r.devolucao)}.</p>`,
dados:em=>textoAssinatura(r,em),
onOk:async ass=>{const rr=R(id);if(!rr||rr.status!=='separada'||rr.assinatura)throw {msg:'Esta retirada já foi assinada ou mudou de situação.'};
await gravarAssinatura(rr,ass,ass.metodo==='biometria'?'Com digital, Face ID ou senha do celular, no celular do militar':'Com a senha do SICAM, no celular do militar');}});
}
function assinar0(id){
const r=R(id);if(!r||r.status!=='separada'||r.assinatura)return;
const u=me();const temBio=bioOk&&bioLocal(u.id)&&(u.passkeys||[]).some(k=>k.id===bioLocal(u.id));
openModal('Assinar retirada – '+nr(r.num),`<div class="stack">
<div class="ficha"><p style="font-weight:600">${esc(nomeM(r.userId))}</p>
<ul class="itens">${r.unidades.map(uid=>{const x=unid(uid)||{pat:'?'};return `<li><span class="mono">${esc(x.pat)}</span><span>${esc(tipo(x.tipoId).nome)}${x.serie?` <span class="small muted">(série ${esc(x.serie)})</span>`:''}</span></li>`;}).join('')}${munLi(r)}</ul>
<dl class="meta"><dt>Devolver até</dt><dd>${fmt(r.devolucao)}</dd></dl></div>
<p class="aviso">Declaro que recebi o material acima, conferi os números e o estado de conservação, e me responsabilizo pela guarda e pela devolução até ${fmt(r.devolucao)}.</p>
${temBio?`<button class="btn btn-pri btn-block" data-act="assinarBio" data-id="${r.id}">Assinar com digital / Face ID</button>`:''}
<form id="f-assinar" data-id="${r.id}" class="stack" autocomplete="off">
<label class="f"><span>${temBio?'Ou assine com sua senha':'Assine com sua senha'}</span><input class="i" type="password" name="s" required autocomplete="current-password"></label>
<p class="erro" id="ass-erro"></p>
<button class="btn ${temBio?'':'btn-pri '}btn-block">Assinar com senha</button></form>
${bioOk&&!temBio?'<p class="small muted">Dica: em Perfil você pode ativar a assinatura por digital/Face ID neste celular.</p>':''}
</div>`,'','Assine só com o material na sua frente.');
}
async function gravarAssinatura(r,ass,obs){
await updateDoc(doc(db,'reservas',r.id),{assinatura:ass,log:[...r.log,{t:ass.em,a:'Assinada',por:sess.userId,obs}]});
closeModal();toast('Retirada assinada. Aguarde o Furriel confirmar a entrega.');
}
async function assinarSenha(form,fd){
const r=R(form.dataset.id);const u=auth.currentUser;
try{await reauthenticateWithCredential(u,EmailAuthProvider.credential(u.email,String(fd.get('s'))));}
catch(e){$('#ass-erro').textContent=(e.code==='auth/invalid-credential'||e.code==='auth/wrong-password')?'Senha incorreta.':erroFirebase(e);return;}
const em=nowISO(),dados=textoAssinatura(r,em);
const hash=b64u(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(dados)));
await gravarAssinatura(r,{por:sess.userId,em,metodo:'senha',dados,hash,aparelho:navigator.userAgent.slice(0,160)},'Com senha no celular do militar');
}
async function assinarBio(id){
const r=R(id);const credId=bioLocal(sess.userId);if(!r||!credId)return;
const em=nowISO(),dados=textoAssinatura(r,em);
const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(dados));
let a;
try{a=await navigator.credentials.get({publicKey:{challenge:hash,rpId:location.hostname,allowCredentials:[{type:'public-key',id:ub64u(credId)}],userVerification:'required',timeout:60000}});}
catch(e){const el=$('#ass-erro');if(el)el.textContent='A digital/Face ID não foi confirmada. Tente de novo ou assine com a senha.';return;}
await gravarAssinatura(r,{por:sess.userId,em,metodo:'biometria',dados,hash:b64u(hash),credId:a.id,
authData:b64u(a.response.authenticatorData),clientData:b64u(a.response.clientDataJSON),sig:b64u(a.response.signature),aparelho:navigator.userAgent.slice(0,160)},'Com digital/Face ID no celular do militar');
}
async function ativarBio(){
const u=me();
let c;
try{c=await navigator.credentials.create({publicKey:{challenge:crypto.getRandomValues(new Uint8Array(32)),rp:{name:'SICAM',id:location.hostname},
user:{id:new TextEncoder().encode(u.id),name:emailUser(u),displayName:nomeM(u.id)},pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],
authenticatorSelection:{authenticatorAttachment:'platform',userVerification:'required',residentKey:'preferred'},timeout:60000,attestation:'none'}});}
catch(e){toast('Não foi possível ativar. Confira se o celular tem digital ou Face ID cadastrados.',true);return;}
let pk=null,alg=null;try{pk=c.response.getPublicKey?b64u(c.response.getPublicKey()):null;alg=c.response.getPublicKeyAlgorithm?c.response.getPublicKeyAlgorithm():null;}catch(e){}
const lista=[...(u.passkeys||[]),{id:c.id,publicKey:pk,alg,criadoEm:nowISO(),aparelho:navigator.userAgent.slice(0,160)}].slice(-5);
await updateDoc(doc(db,'users',u.id),{passkeys:lista});
try{localStorage.setItem(bioKey(u.id),c.id);}catch(e){}
bioRecente=c.id;
toast('Assinatura por digital, Face ID ou senha do celular ativada neste aparelho.');render();
}
function confirmarEntrega(id){
const r=R(id);if(!r||!r.assinatura)return;const a=r.assinatura;
pedirAssinatura({titulo:'Confirmar entrega – '+nr(r.num),rotulo:'Confirmar entrega',
corpo:`<div class="ficha">${stamp(r)}<p style="font-weight:600">${esc(nomeM(r.userId))}</p><p class="small muted">${esc(user(r.userId).pelotao)}</p>${fichaItens(r)}
<dl class="meta"><dt>Assinado</dt><dd>${fmt(a.em)}, ${esc(FORMA[a.metodo]||METODO[a.metodo]||a.metodo)}</dd><dt>Devolver até</dt><dd>${fmt(r.devolucao)}</dd></dl></div>
<p class="aviso">Conferi a identidade do militar e entreguei o material listado.</p>`,
dados:em=>`SICAM | Entrega da cautela ${nr(r.num)} a ${nomeM(r.userId)} | Furriel ${nomeM(sess.userId)} | ${em}`,
onOk:ass=>efetivarEntrega(id,ass)});
}
async function efetivarEntrega(id,ass){
const r=R(id);if(!r||!r.assinatura||r.status!=='separada')throw {msg:'Esta cautela mudou de situação. Feche e confira.'};
const b=writeBatch(db);
r.unidades.forEach(uid=>b.update(doc(db,'unidades',uid),{status:'cautelado'}));
b.update(doc(db,'reservas',r.id),{status:'cautelada',anuencia:ass,log:[...r.log,{t:ass.em,a:'Cautelada',por:sess.userId,obs:'Entrega confirmada pelo Furriel, '+(FORMA[ass.metodo]||ass.metodo)}]});
await b.commit();closeModal();toast(`Cautela ${nr(r.num)} efetivada.`);
}
async function comAuthSecundario(fn){
const app2=initializeApp(SICAM_FIREBASE,'sec-'+Date.now());
const a2=initializeAuth(app2,{persistence:inMemoryPersistence});
try{return await fn(a2);}finally{try{await signOut(a2);}catch(e){} try{await deleteApp(app2);}catch(e){}}
}
async function confirmarCautela(form,fd){
const r=R(form.dataset.id);
try{await comAuthSecundario(a2=>signInWithEmailAndPassword(a2,emailUser(user(r.userId)),fd.get('s')));}
catch(e){$('#caut-erro').textContent=e.code==='auth/too-many-requests'?erroFirebase(e):'Senha incorreta. Peça ao militar para digitar de novo.';return;}
const b=writeBatch(db);
r.unidades.forEach(id=>b.update(doc(db,'unidades',id),{status:'cautelado'}));
const em=nowISO();
b.update(doc(db,'reservas',r.id),{status:'cautelada',assinatura:{por:r.userId,em,metodo:'balcao',registradoPor:sess.userId},anuencia:{por:sess.userId,em},
log:[...r.log,{t:em,a:'Assinada',por:r.userId,obs:'Com senha no computador da Furrielação'},entrada('Cautelada','Entrega confirmada pelo Furriel')]});
await b.commit();closeModal();toast(`Cautela ${nr(r.num)} registrada.`);
}
function devolverCadete(id){
const r=R(id);if(!r||r.status!=='cautelada'||r.userId!==sess.userId)return;
if(r.transferPara){toast('Há uma transferência pendente desta cautela. Cancele-a antes de devolver.',true);return;}
if(r.devAssCadete){toast('Você já assinou a devolução. Aguarde o Furriel conferir.',true);return;}
pedirAssinatura({titulo:'Devolver material – '+nr(r.num),sub:'Assine na Furrielação, no momento da entrega do material.',rotulo:'Assinar devolução',
corpo:`<div class="ficha"><p style="font-weight:600">${esc(nomeM(r.userId))}</p>${fichaItens(r)}</div>
<p class="aviso">Declaro que estou devolvendo à Furrielação o material acima. O Furriel vai conferir o estado de cada item e assinar em seguida.${(r.municao||[]).length?' Se sobrou munição, entregue a sobra junto.':''}</p>`,
dados:em=>`SICAM | Devolução da cautela ${nr(r.num)} | ${nomeM(r.userId)} | Material: ${(r.unidades||[]).map(i=>(unid(i)||{pat:i}).pat).concat((r.municao||[]).map(munTxt)).join(', ')} | ${em}`,
onOk:async ass=>{const rr=R(id);if(!rr||rr.status!=='cautelada'||rr.devAssCadete||rr.transferPara)throw {msg:'Esta cautela mudou de situação. Feche e confira.'};
await updateDoc(doc(db,'reservas',rr.id),{devAssCadete:ass,log:[...rr.log,{t:ass.em,a:'Devolução assinada pelo militar',por:sess.userId,obs:FORMA[ass.metodo]||ass.metodo}]});
closeModal();toast('Devolução assinada. Aguarde o Furriel conferir e assinar.');}});
}
function devolver(id){
const r=R(id);if(!r)return;
if(!r.devAssCadete){
openModal('Registrar devolução – '+nr(r.num),`<div class="stack"><p>${esc(nomeM(r.userId))}${atrasada(r)?` <span class="stamp c-stamp">Em atraso</span>`:''}</p>
<div class="ficha">${fichaItens(r)}</div>
<p class="aviso">A devolução é assinada pelos dois: primeiro o militar, no celular dele (Material → Cautelado com você → <b>Devolver material</b>). Esta tela atualiza sozinha quando ele assinar; depois é a sua vez de conferir e assinar.</p>
${r.transferPara?`<p class="small c-brass">Há uma transferência pendente para ${esc(nomeM(r.transferPara))}.</p>`:''}
<details><summary class="small">Militar sem celular? Assinar no balcão</summary>
<form id="f-devbalcao" data-id="${r.id}" class="stack" autocomplete="off" style="margin-top:.6rem">
<label class="f"><span>Senha do SICAM de ${esc(nomeM(r.userId))}</span><input class="i" type="password" name="s" required autocomplete="new-password"></label>
<p class="erro" id="devb-erro"></p><button class="btn btn-block">Registrar assinatura do militar</button></form></details></div>`,'','Aguardando a assinatura do militar');
ui.devAguardando=r.id;return;}
ui.devAguardando=null;
openModal('Conferir devolução – '+nr(r.num),`<form id="f-dev" data-id="${r.id}" class="stack">
<p>${esc(nomeM(r.userId))}${atrasada(r)?` <span class="stamp c-stamp">Em atraso</span>`:''}</p>
<p class="small c-ok">Militar assinou a devolução em ${fmt(r.devAssCadete.em)}, ${esc(FORMA[r.devAssCadete.metodo]||r.devAssCadete.metodo)}.</p>
<div class="ficha">${r.unidades.map(uid=>{const u=unid(uid)||{pat:'?',id:uid};return `<div class="dev-row"><div><span class="mono">${esc(u.pat)}</span> <span class="small muted">${esc(tipo(u.tipoId).nome)}</span></div>
<select class="i" name="c_${uid}" style="width:auto"><option value="ok">Em condições</option><option value="avaria">Com avaria</option><option value="extraviado">Extraviado</option></select></div>`;}).join('')}
${(r.municao||[]).map((x,k)=>`<div class="dev-mun" data-k="${k}" data-q="${x.qtd}"><div><b>${x.qtd} cart. ${esc(tipo(x.tipoId).nome)}</b><span class="ser mono">Lote ${esc(loteTxt(x))}</span></div>
<label class="f" style="margin-top:.5rem"><span>Sobra devolvida (cartuchos)</span><input class="i" type="number" inputmode="numeric" min="0" max="${x.qtd}" name="md_${k}" placeholder="0" data-inpmun="1"></label>
<p class="calc" data-calc="${k}">Sem sobra: ${x.qtd} cartuchos utilizados.</p></div>`).join('')}</div>
<label class="f"><span>Observação (opcional)</span><textarea class="i" name="obs" placeholder="Ex.: HT-002 devolvido sem bateria"></textarea></label>
<p class="small muted">Material com avaria vai para manutenção e sai da lista de disponíveis.${(r.municao||[]).length?' Munição: informe só a sobra, se houver; em branco = tudo utilizado. A sobra volta ao estoque do lote.':''}</p>
<p class="erro" id="dev-erro"></p>
<button class="btn btn-pri btn-block">Continuar para assinar</button></form>`);
}
async function devolucaoBalcao(form,fd){
const r=R(form.dataset.id);if(!r)return;
try{await comAuthSecundario(a2=>signInWithEmailAndPassword(a2,emailUser(user(r.userId)),fd.get('s')));}
catch(e){$('#devb-erro').textContent=e.code==='auth/too-many-requests'?erroFirebase(e):'Senha incorreta. Peça ao militar para digitar de novo.';return;}
const em=nowISO();
await updateDoc(doc(db,'reservas',r.id),{devAssCadete:{por:r.userId,em,metodo:'balcao',registradoPor:sess.userId},log:[...r.log,{t:em,a:'Devolução assinada pelo militar',por:r.userId,obs:'Com senha no aparelho da Furrielação'}]});
toast('Assinatura do militar registrada. Agora confira o material.');
}
async function confirmarDevolucao(form,fd){
const r=R(form.dataset.id);const cond={};let prob=0;const dm=[];
for(const [k,x] of (r.municao||[]).entries()){
const raw=String(fd.get('md_'+k)||'').trim(),dev=raw===''?0:Number(raw);
if(!Number.isInteger(dev)||dev<0||dev>x.qtd){$('#dev-erro').textContent=`${tipo(x.tipoId).nome}: a sobra deve ser um número entre 0 e ${x.qtd}.`;return;}
dm.push({...x,dev,cons:x.qtd-dev});
}
r.unidades.forEach(id=>{const c=fd.get('c_'+id)||'ok';cond[id]=c;if(c!=='ok')prob++;});
const consTxt=dm.map(x=>`${tipo(x.tipoId).nome}: ${x.cons} utilizado(s)${x.dev?`, ${x.dev} devolvido(s)`:''}`).join('; ');
const obs=[String(fd.get('obs')||'').trim(),consTxt].filter(Boolean).join(' · ')||(prob?`${prob} item(ns) com alteração`:'Todos em condições');
const resumo=r.unidades.map(id=>`${(unid(id)||{pat:id}).pat}: ${CONDTXT[cond[id]]||cond[id]}`).concat(dm.map(x=>`${x.qtd} cart. ${tipo(x.tipoId).nome}: ${x.cons} utilizado(s), sobra ${x.dev}`));
pedirAssinatura({titulo:'Assinar devolução – '+nr(r.num),rotulo:'Assinar e concluir devolução',
corpo:`<div class="ficha"><p style="font-weight:600">${esc(nomeM(r.userId))}</p><ul class="itens">${resumo.map(t=>`<li><span>${esc(t)}</span></li>`).join('')}</ul>${String(fd.get('obs')||'').trim()?`<p class="small">Obs.: ${esc(String(fd.get('obs')).trim())}</p>`:''}</div>
<p class="aviso">Conferi o material devolvido e registrei a situação de cada item.</p>`,
dados:em=>`SICAM | Devolução conferida da cautela ${nr(r.num)} | ${nomeM(r.userId)} | ${resumo.join('; ')} | Furriel ${nomeM(sess.userId)} | ${em}`,
onOk:async ass=>{
await runTransaction(db,async tx=>{
const os=await tx.get(doc(db,'reservas',r.id));const o=os.data();if(!o||o.status!=='cautelada'||!o.devAssCadete)throw {msg:'Esta cautela mudou de situação. Feche e confira.'};
const com=dm.filter(x=>x.dev>0);const somas={};com.forEach(x=>{somas[x.loteId]=(somas[x.loteId]||0)+x.dev;});
const ids=Object.keys(somas);const lsn=await Promise.all(ids.map(id=>tx.get(doc(db,'lotes',id))));
r.unidades.forEach(id=>tx.update(doc(db,'unidades',id),{status:cond[id]==='ok'?'disponivel':cond[id]==='avaria'?'manutencao':'extraviado'}));
ids.forEach((id,i)=>{if(lsn[i].exists())tx.update(doc(db,'lotes',id),{qtd:(lsn[i].data().qtd||0)+somas[id]});});
const upd={status:'devolvida',cond,devAssFurriel:ass,log:[...(o.log||[]),{t:ass.em,a:'Devolvida',por:sess.userId,obs:obs+' – conferida e assinada pelo Furriel, '+(FORMA[ass.metodo]||ass.metodo)}]};if(dm.length)upd.devMun=dm;
tx.update(doc(db,'reservas',r.id),upd);
});
closeModal();toast(`Devolução de ${nr(r.num)} concluída, assinada pelos dois.`,prob>0);}});
}
function camposTipo(t){
t=t||{};const cat=t.id?catOf(t):'';const opts=[...new Set([...CATS,...D.tipos.map(catOf)])];
return `<label class="f"><span>Nome do material</span><input class="i" name="nome" required value="${esc(t.nome||'')}" placeholder="Ex.: Pistola Beretta APX"></label>
<label class="f"><span>Categoria</span><select class="i" name="cat">${opts.map(c=>`<option ${c===cat?'selected':''}>${esc(c)}</option>`).join('')}</select></label>
<label class="f"><span>Descrição (opcional)</span><input class="i" name="desc" value="${esc(t.desc||'')}" placeholder="Ex.: Cal. 9 mm, com coldre e 2 carregadores"></label>
<label class="check"><input type="checkbox" name="vis" ${t.oculto?'':'checked'}><span>Mostrar este material para os cadetes solicitarem</span></label>`;
}
function novoTipo(){
openModal('Cadastrar material',`<form id="f-tipo" class="stack">${camposTipo()}
<div class="grid2"><label class="f"><span>Prefixo do patrimônio</span><input class="i" name="pre" required maxlength="6" placeholder="PBA"></label>
<label class="f"><span>Quantidade de unidades</span><input class="i" name="q" type="number" min="1" max="300" value="1" required></label></div>
<p class="small muted">As unidades recebem números automáticos (ex.: PBA-001). Para usar o patrimônio e o nº de série oficiais, prefira "Importar planilha".</p>
<button class="btn btn-pri btn-block">Cadastrar</button></form>`);
}
function editTipo(id){
const t=tipo(id);if(t.mun){formMun(t);return;}const usado=D.reservas.some(r=>(r.itens||[]).some(i=>i.tipoId===id));
openModal('Editar material',`<form id="f-edtipo" data-id="${id}" class="stack">${camposTipo(t)}
<button class="btn btn-pri btn-block">Salvar</button></form>
${usado?'<p class="small muted" style="margin-top:.9rem">Este material já aparece em solicitações, por isso não pode ser excluído. Para tirá-lo da lista dos cadetes, desmarque a opção acima.</p>'
:`<button class="btn btn-warn btn-block" style="margin-top:.9rem" data-act="delTipo" data-id="${id}">Excluir este material e suas ${D.unidades.filter(u=>u.tipoId===id).length} unidades</button>`}`);
}
/* ============ Importar planilha ============ */
async function carregarXLSX(){
if(window.XLSX)return window.XLSX;
await new Promise((res,rej)=>{const sc=document.createElement('script');sc.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
sc.onload=res;sc.onerror=()=>rej(new Error('Não foi possível carregar o leitor de planilhas. Confira a internet.'));document.head.appendChild(sc);});
return window.XLSX;
}
const SIN=[['patrimonio',['patrimonio','tombamento']],['serie',['serie']],['qtd',['quantidade','qtd','qtde','quant']],['calibre',['calibre']],
['categoria',['categoria','grupo','classe']],['tipoArma',['tipodearma']],['marca',['marca','fabricante']],['modelo',['modelo']],
['situacao',['situacao','status','estado']],['tamanho',['tamanho']],['obs',['observacao','obs']],['lote',['lote']],
['material',['material','nome','item','equipamento','denominacao']],['desc',['descricao','especificacao','detalhe']]];
function mapearCabecalho(row){
const m={};row.forEach((h,i)=>{const n=normTxt(h);if(!n)return;for(const [k,ss] of SIN){if(m[k]!=null)continue;if(ss.some(x=>n.includes(x))){m[k]=i;return;}}});
return m;
}
function prefixoDe(nome){const w=String(nome).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().split(/[^A-Z0-9]+/).filter(x=>x&&!['DE','DA','DO','DAS','DOS','E','COM'].includes(x));
return (w.length>1?w.slice(0,4).map(x=>x[0]).join(''):(w[0]||'UN').slice(0,4))||'UN';}
async function lerPlanilha(file){
const X=await carregarXLSX();
const wb=X.read(await file.arrayBuffer(),{type:'array'});
const avisos=[], grupos=new Map();let ignoradas=0;
for(const nomeAba of wb.SheetNames){
if(/instru|lista/i.test(nomeAba))continue;
const rows=X.utils.sheet_to_json(wb.Sheets[nomeAba],{header:1,defval:'',raw:false});
let hi=-1,m=null;
for(let i=0;i<Math.min(rows.length,12);i++){const mm=mapearCabecalho(rows[i]);if(Object.keys(mm).length>=2&&(mm.material!=null||mm.modelo!=null||mm.tipoArma!=null||mm.desc!=null)){hi=i;m=mm;break;}}
if(hi<0){if(rows.length)avisos.push(`Aba "${nomeAba}": não encontrei a linha de títulos (ex.: Material, Patrimônio). Aba ignorada.`);continue;}
if(m.lote!=null||/muni/i.test(nomeAba)){avisos.push(`Aba "${nomeAba}": munição não é importada pela planilha. Cadastre em Material → Cadastrar munição.`);continue;}
const armaAba=/arma/i.test(nomeAba);
for(let i=hi+1;i<rows.length;i++){
const r=rows[i];const g=k=>m[k]!=null?String(r[m[k]]||'').trim():'';
let nome=g('material');const partes=[g('tipoArma'),g('marca'),g('modelo')].filter(Boolean);
if(!nome)nome=partes.join(' ');if(!nome&&m.desc!=null&&m.material==null)nome=g('desc');
if(!nome)continue;
if(/exemplo/i.test(g('obs'))||/^exemplo/i.test(g('patrimonio'))){continue;}
const sit=normTxt(g('situacao'));
if(/baix|inserv/.test(sit)){ignoradas++;continue;}
const status=/manut/.test(sit)?'manutencao':/extrav/.test(sit)?'extraviado':'disponivel';
const extra=partes.filter(x=>!normTxt(nome).includes(normTxt(x))).join(' ');
let desc=m.material!=null?[g('desc'),g('material')?extra:''].filter(Boolean).join(' – '):(m.desc!=null&&nome!==g('desc')?g('desc'):'');
if(g('calibre'))desc=[desc,'Cal. '+g('calibre')].filter(Boolean).join(' – ');
const cat=normCat(g('categoria')||(armaAba?'Armas de fogo':''),nome);
const pat=g('patrimonio'), serie=g('serie');
const qtd=(pat||serie)?1:Math.max(1,Math.min(500,parseInt(g('qtd').replace(/\D/g,''))||1));
const key=normTxt(nome);
if(!grupos.has(key))grupos.set(key,{nome,categoria:cat,desc,units:[]});
const gr=grupos.get(key);if(!gr.desc&&desc)gr.desc=desc;
for(let k=0;k<qtd;k++)gr.units.push({pat,serie,status,obs:g('obs'),tamanho:g('tamanho'),linha:`${nomeAba}, linha ${i+1}`});
}
}
// cruzar com o que já existe
const pats=new Set(D.unidades.map(u=>normTxt(u.pat))), series=new Set(D.unidades.filter(u=>u.serie).map(u=>normTxt(u.serie)));
const plano=[];let dup=0;
for(const gr of grupos.values()){
const ex=D.tipos.find(t=>normTxt(t.nome)===normTxt(gr.nome));
const pre=(ex&&ex.prefixo)||prefixoDe(gr.nome);let n=D.unidades.filter(u=>ex&&u.tipoId===ex.id).length;
const ok=[];
for(const u of gr.units){
if(u.pat&&pats.has(normTxt(u.pat))){dup++;avisos.push(`${u.linha}: patrimônio ${u.pat} já existe. Não importado.`);continue;}
if(u.serie&&series.has(normTxt(u.serie))){dup++;avisos.push(`${u.linha}: nº de série ${u.serie} já existe. Não importado.`);continue;}
let pat=u.pat;if(!pat){do{n++;pat=pre+'-'+String(n).padStart(3,'0');}while(pats.has(normTxt(pat)));}
pats.add(normTxt(pat));if(u.serie)series.add(normTxt(u.serie));
ok.push({...u,pat});
}
if(ok.length)plano.push({...gr,prefixo:pre,existenteId:ex?ex.id:null,units:ok});
}
if(ignoradas)avisos.push(`${ignoradas} linha(s) marcadas como baixadas/inservíveis não foram importadas.`);
return {plano,avisos,dup};
}
function abrirImportar(){
ui.imp=null;
openModal('Importar planilha de material',`<div class="stack">
<p>Envie o arquivo Excel (.xlsx) ou CSV com a relação do material. O app reconhece colunas como <b>Categoria, Material, Modelo, Calibre, Nº de patrimônio, Nº de série, Quantidade e Situação</b>, em qualquer ordem.</p>
<p class="small muted">Uma linha por unidade quando houver patrimônio ou nº de série. Item sem numeração: uma linha com a quantidade total. Nada é gravado antes de você conferir e confirmar.</p>
<input type="file" id="imp-file" class="i" accept=".xlsx,.xls,.csv">
<div id="imp-prev"></div></div>`);
}
async function previaImportacao(file){
const box=$('#imp-prev');box.innerHTML='<div class="loading" style="min-height:0;padding:1rem"><div><div class="spin"></div>Lendo a planilha…</div></div>';
let res;try{res=await lerPlanilha(file);}catch(e){box.innerHTML=`<p class="erro">${esc(e.message||'Não consegui ler esse arquivo.')}</p>`;return;}
ui.imp=res;const tot=res.plano.reduce((a,g)=>a+g.units.length,0), novos=res.plano.filter(g=>!g.existenteId).length;
if(!tot){box.innerHTML=`<p class="erro">Nenhum material novo encontrado nesse arquivo.</p>${res.avisos.length?`<ul class="small">${res.avisos.slice(0,30).map(a=>`<li>${esc(a)}</li>`).join('')}</ul>`:''}`;return;}
const porCat={};res.plano.forEach(g=>{(porCat[g.categoria]=porCat[g.categoria]||[]).push(g);});
box.innerHTML=`<div class="aviso"><b>${tot} unidades</b> em <b>${res.plano.length} tipos</b> (${novos} novos, ${res.plano.length-novos} já existentes)</div>
<div class="tbl-wrap" style="margin-top:.7rem;max-height:40vh;overflow:auto"><table><thead><tr><th>Categoria</th><th>Material</th><th>Unid.</th><th>Exemplo de nº</th></tr></thead><tbody>
${Object.entries(porCat).map(([c,l])=>l.map((g,i)=>`<tr><td>${i?'':esc(c)}</td><td>${esc(g.nome)}${g.existenteId?' <span class="tag">já existe</span>':''}${g.desc?`<br><span class="small muted">${esc(g.desc)}</span>`:''}</td><td>${g.units.length}</td><td class="mono">${esc(g.units[0].pat)}${g.units[0].serie?`<br><span class="small muted">${esc(g.units[0].serie)}</span>`:''}</td></tr>`).join('')).join('')}
</tbody></table></div>
${res.avisos.length?`<details style="margin-top:.6rem"><summary class="small">${res.avisos.length} aviso(s)</summary><ul class="small">${res.avisos.slice(0,60).map(a=>`<li>${esc(a)}</li>`).join('')}</ul></details>`:''}
<label class="check" style="margin-top:.8rem"><input type="checkbox" id="imp-armas" checked><span>Mostrar as armas de fogo para os cadetes solicitarem</span></label>
<button class="btn btn-pri btn-block" style="margin-top:.8rem" data-act="impConfirmar">Importar ${tot} unidades</button>`;
}
async function confirmarImportacao(btn){
const res=ui.imp;if(!res)return;btn.disabled=true;btn.textContent='Importando…';
const armasVis=$('#imp-armas')?$('#imp-armas').checked:true;
const ops=[];let ordem=D.tipos.length;
for(const g of res.plano){
let tid=g.existenteId;
if(!tid){const ref=doc(collection(db,'tipos'));tid=ref.id;ops.push(['set',ref,{nome:g.nome,categoria:g.categoria,desc:g.desc||'',prefixo:g.prefixo,ordem:ordem++,oculto:g.categoria==='Armas de fogo'&&!armasVis}]);}
for(const u of g.units){const d={tipoId:tid,pat:u.pat,status:u.status};if(u.serie)d.serie=u.serie;if(u.obs)d.obs=u.obs;if(u.tamanho)d.tamanho=u.tamanho;ops.push(['set',doc(collection(db,'unidades')),d]);}
}
for(let i=0;i<ops.length;i+=450){const b=writeBatch(db);ops.slice(i,i+450).forEach(([,r,d])=>b.set(r,d));await b.commit();}
const tot=res.plano.reduce((a,g)=>a+g.units.length,0);ui.imp=null;closeModal();toast(`${tot} unidades importadas.`);
}
function novoUser(){
openModal('Cadastrar militar',`<form id="f-user" class="stack" autocomplete="off">
<div class="grid2"><label class="f"><span>Posto / graduação</span><input class="i" name="grad" value="Cad PM"></label>
<label class="f"><span>Nome de guerra</span><input class="i" name="nome" required></label></div>
<div class="grid2"><label class="f"><span>Nº de aluno / RG</span><input class="i" name="num"></label>
<label class="f"><span>Pelotão / setor</span><input class="i" name="pel" value="1º Pelotão"></label></div>
<label class="f"><span>E-mail institucional</span><input class="i" name="login" required autocapitalize="off"></label>
<div class="grid2"><label class="f"><span>Perfil</span><select class="i" name="perfil"><option value="aluno">Solicitante</option><option value="furriel">Furriel</option></select></label>
<label class="f"><span>Senha inicial (mín. 6)</span><input class="i" name="senha" required minlength="6"></label></div>
<p class="small muted">Prefira que o próprio militar se cadastre pelo link "Criar minha conta". Use esta tela só para exceções. No primeiro acesso ele confirma o e-mail e pode trocar a senha em Perfil.</p>
<p class="erro" id="user-erro"></p>
<button class="btn btn-pri btn-block">Cadastrar</button></form>`);
}
async function carregarExemplo(){
const tipos=[['HT (rádio transceptor)','HT',8,'Rádio portátil com bateria e carregador'],['Capacete balístico','CAP',10,'Nível IIIA, com jugular'],
['Colete balístico','COL',12,'Tamanhos M e G'],['Tonfa','TON',15,'Policarbonato, com porta-tonfa'],['Capa de chuva','CPC',20,'Modelo ostensivo'],['Lanterna tática','LAN',6,'Com pilhas reserva']];
const b=writeBatch(db);
tipos.forEach(([nome,pre,q,desc],i)=>{const id='ex'+i;b.set(doc(db,'tipos',id),{nome,prefixo:pre,desc,ordem:i});
for(let k=1;k<=q;k++)b.set(doc(db,'unidades',id+'_'+k),{tipoId:id,pat:pre+'-'+String(k).padStart(3,'0'),status:'disponivel'});});
await b.commit();
}
/* ============ Relatórios (PDF e Excel) ============ */
const fmtC=iso=>{if(!iso)return '';const d=new Date(iso);if(isNaN(d))return '';return d.toLocaleDateString('pt-BR')+' '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});};
const logDe=(r,a)=>(r.log||[]).filter(l=>l.a===a).slice(-1)[0];
const quando=(r,a)=>{const l=logDe(r,a);return l?fmtC(l.t):'';};
const porQuem=(r,a)=>{const l=logDe(r,a);return l&&l.por?nomeM(l.por):'';};
const METODO2={...METODO,transferencia:'aceite de transferência no celular do militar',senha:'com a senha do SICAM, no celular do militar',biometria:'com digital, Face ID ou senha do celular do militar'};
const formaTxt=a=>a?(FORMA[a.metodo]||METODO2[a.metodo]||a.metodo||''):'';
const CONDTXT={ok:'Em condições',avaria:'Com avaria',extraviado:'Extraviado'};
const infoItem=(r,id)=>(r.uinfo&&r.uinfo[id])||unid(id)||{pat:id,tipoId:''};
function dadosRel(lista){
return lista.map(r=>{
const u=user(r.userId);
const us=(r.unidades||[]).map(id=>{const x=infoItem(r,id);const c=r.cond&&r.cond[id];return {material:tipo(x.tipoId).nome,pat:x.pat||'',serie:x.serie||'',lote:'',qtd:1,sit:c?(CONDTXT[c]||c):''};});
const mun=(r.municao||[]).map((x,k)=>{const dv=(r.devMun||[])[k];return {material:tipo(x.tipoId).nome,pat:'',serie:'',lote:loteTxt(x),qtd:x.qtd,sit:dv?`${dv.cons} utilizado(s)${dv.dev?`; sobra de ${dv.dev} devolvida`:'; sem sobra'}`:''};});
const destinos=D.reservas.filter(x=>x.origem===r.id);
const saidas=(r.log||[]).filter(l=>['Transferida','Transferência parcial'].includes(l.a)).map(l=>`${l.a} em ${fmtC(l.t)}${l.obs?' – '+l.obs:''}`);
const tr=r.transferencia||{};const orig=r.origem?D.reservas.find(x=>x.id===r.origem):null;
return {r,num:nr(r.num),militar:nomeM(r.userId),numAluno:u.login||'',pelotao:u.pelotao||'',
situacao:atrasada(r)?'Em atraso':(ST[r.status]||[r.status])[0],finalidade:r.finalidade||'',obs:r.obs||'',itens:itensTxt(r),
pedidoOriginal:r.itensSol?r.itensSol.map(qtdNome).join(', '):'',
retPrev:fmtC(r.retirada),devPrev:fmtC(r.devolucao),
solicitada:r.origem?'':quando(r,'Solicitada'),aprovada:quando(r,'Aprovada'),aprovadaPor:porQuem(r,'Aprovada'),
separada:quando(r,'Separada'),separadaPor:porQuem(r,'Separada'),
assinada:r.assinatura?fmtC(r.assinatura.em):quando(r,'Assinada'),formaAss:r.assinatura?(METODO2[r.assinatura.metodo]||r.assinatura.metodo):'',
codAss:r.assinatura&&r.assinatura.hash?String(r.assinatura.hash).slice(0,16):'',
cautelada:r.origem?fmtC(tr.em||r.criadoEm):quando(r,'Cautelada'),cauteladaPor:r.origem?'Por transferência':porQuem(r,'Cautelada'),
devolvida:quando(r,'Devolvida'),devolvidaPor:porQuem(r,'Devolvida'),
devCadete:r.devAssCadete?`${fmtC(r.devAssCadete.em)}, ${formaTxt(r.devAssCadete)}`:'',devFurriel:r.devAssFurriel?`${fmtC(r.devAssFurriel.em)} por ${nomeM(r.devAssFurriel.por)}, ${formaTxt(r.devAssFurriel)}`:'',
entregaAss:r.anuencia&&r.anuencia.metodo?`${fmtC(r.anuencia.em)} por ${nomeM(r.anuencia.por)}, ${formaTxt(r.anuencia)}`:'',obsDev:(logDe(r,'Devolvida')||{}).obs||'',
encerramento:(logDe(r,'Recusada')||logDe(r,'Cancelada'))?`${(logDe(r,'Recusada')||logDe(r,'Cancelada')).a} em ${fmtC((logDe(r,'Recusada')||logDe(r,'Cancelada')).t)}${(logDe(r,'Recusada')||logDe(r,'Cancelada')).obs?' – '+(logDe(r,'Recusada')||logDe(r,'Cancelada')).obs:''}`:'',
transfEntrada:r.origem?`Recebida de ${nomeM(tr.de)} em ${fmtC(tr.em||r.criadoEm)}${orig?` (cautela de origem ${nr(orig.num)})`:''}`:'',
transfSaida:destinos.length?destinos.map(x=>`Para ${nomeM(x.userId)} em ${fmtC((x.transferencia||{}).em||x.criadoEm)} (cautela de destino ${nr(x.num)}): ${itensTxt(x)}`).join(' | '):saidas.join(' | '),
transfPendente:r.transferPara?`Aguardando aceite de ${nomeM(r.transferPara)} (pedido em ${fmtC((r.transfer||{}).em)})`:'',
itensLista:us.concat(mun),andamento:(r.log||[]).map(l=>({t:fmtC(l.t),a:l.a,por:l.por?nomeM(l.por):'',obs:l.obs||''}))};
});
}
const CAMPOS=[['num','Nº'],['militar','Militar'],['numAluno','Nº de aluno'],['pelotao','Pelotão'],['situacao','Situação'],['finalidade','Finalidade'],['itens','Material'],
['pedidoOriginal','Pedido original (atendimento parcial)'],['retPrev','Retirada prevista'],['devPrev','Devolução prevista'],['solicitada','Solicitada em'],
['aprovada','Aprovada em'],['aprovadaPor','Aprovada por'],['separada','Separada em'],['separadaPor','Separada por'],['assinada','Assinada em'],['formaAss','Forma de assinatura'],
['codAss','Código da assinatura'],['cautelada','Cautelada (entrega) em'],['cauteladaPor','Entrega confirmada por'],['transfEntrada','Recebida por transferência'],
['transfSaida','Transferida a outro militar'],['transfPendente','Transferência pendente'],['entregaAss','Entrega assinada pelo Furriel'],['devCadete','Devolução assinada pelo militar'],['devolvida','Devolvida em'],['devolvidaPor','Devolução recebida por'],['devFurriel','Devolução conferida e assinada pelo Furriel'],
['obsDev','Observação da devolução'],['encerramento','Recusa / cancelamento'],['obs','Observação do pedido']];
function baixarArquivo(blob,nome){
const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=nome;document.body.appendChild(a);a.click();
setTimeout(()=>{URL.revokeObjectURL(url);a.remove();},4000);
}
function escopoRel(el){
const e=el.dataset.escopo;
if(e==='uma'){const r=D.reservas.find(x=>x.id===el.dataset.id);return {lista:r?[r]:[],titulo:r?`Cautela ${nr(r.num)} – ${nomeM(r.userId)}`:'',arq:r?'cautela-'+String(r.num).padStart(3,'0'):'cautela'};}
if(e==='meus'){return {lista:D.reservas.filter(r=>r.userId===sess.userId).sort((a,b)=>b.num-a.num),titulo:`Histórico de cautelas – ${nomeM(sess.userId)}`,arq:'meu-historico'};}
const filtro=[ui.q&&ui.q.trim()?`busca "${ui.q.trim()}"`:'',ui.fs!=='todos'?`situação: ${ui.fs==='atraso'?'Em atraso':(ST[ui.fs]||[ui.fs])[0]}`:''].filter(Boolean).join(', ');
return {lista:histFiltrado(),titulo:'Histórico de cautelas'+(filtro?` (${filtro})`:''),arq:'historico'};
}
const carimboArq=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;};
/* ---- Excel (.xlsx) gerado no próprio aparelho, sem depender de serviço externo ---- */
const crcT=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?(0xEDB88320^(c>>>1)):(c>>>1);t[n]=c>>>0;}return t;})();
const crc32=b=>{let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=crcT[(c^b[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;};
function zipArquivos(files){
const enc=new TextEncoder(),partes=[],central=[];let off=0;
for(const f of files){const nm=enc.encode(f.name),crc=crc32(f.data),sz=f.data.length;
const h=new DataView(new ArrayBuffer(30));h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0800,true);h.setUint16(8,0,true);h.setUint16(10,0,true);h.setUint16(12,0x21,true);
h.setUint32(14,crc,true);h.setUint32(18,sz,true);h.setUint32(22,sz,true);h.setUint16(26,nm.length,true);h.setUint16(28,0,true);
partes.push(new Uint8Array(h.buffer),nm,f.data);
const c=new DataView(new ArrayBuffer(46));c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint16(10,0,true);c.setUint16(12,0,true);c.setUint16(14,0x21,true);
c.setUint32(16,crc,true);c.setUint32(20,sz,true);c.setUint32(24,sz,true);c.setUint16(28,nm.length,true);c.setUint16(30,0,true);c.setUint16(32,0,true);c.setUint16(34,0,true);c.setUint16(36,0,true);c.setUint32(38,0,true);c.setUint32(42,off,true);
central.push(new Uint8Array(c.buffer),nm);off+=30+nm.length+sz;}
const cs=central.reduce((a,b)=>a+b.length,0);const e=new DataView(new ArrayBuffer(22));e.setUint32(0,0x06054b50,true);e.setUint16(4,0,true);e.setUint16(6,0,true);
e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,cs,true);e.setUint32(16,off,true);e.setUint16(20,0,true);
return new Blob([...partes,...central,new Uint8Array(e.buffer)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
function montarXLSX(planilhas){
const x=v=>String(v==null?'':v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const col=i=>{let s='';i++;while(i){const m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26);}return s;};
const cel=(v,ref,st)=>typeof v==='number'?`<c r="${ref}" s="${st}"><v>${v}</v></c>`:`<c r="${ref}" s="${st}" t="inlineStr"><is><t xml:space="preserve">${x(v)}</t></is></c>`;
const enc=new TextEncoder(),arq=(name,str)=>({name,data:enc.encode(str)}),X='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const folhas=planilhas.map(p=>{const n=p.linhas.length+1,ult=col(p.cab.length-1);
return X+`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
+`<cols>${p.cab.map((c,i)=>`<col min="${i+1}" max="${i+1}" width="${(p.larg&&p.larg[i])||18}" customWidth="1"/>`).join('')}</cols><sheetData>`
+`<row r="1">${p.cab.map((c,i)=>cel(c,col(i)+'1',1)).join('')}</row>`
+p.linhas.map((l,k)=>`<row r="${k+2}">${l.map((v,i)=>cel(v,col(i)+(k+2),2)).join('')}</row>`).join('')
+`</sheetData>${p.linhas.length?`<autoFilter ref="A1:${ult}${n}"/>`:''}</worksheet>`;});
const files=[
arq('[Content_Types].xml',X+`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${planilhas.map((p,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
arq('_rels/.rels',X+`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
arq('xl/workbook.xml',X+`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${planilhas.map((p,i)=>`<sheet name="${x(p.nome.replace(/[\[\]:*?\/\\]/g,'').slice(0,31))}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`),
arq('xl/_rels/workbook.xml.rels',X+`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${planilhas.map((p,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${planilhas.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
arq('xl/styles.xml',X+`<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2F3D2A"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`),
...folhas.map((f,i)=>arq(`xl/worksheets/sheet${i+1}.xml`,f))];
return zipArquivos(files);
}
function relatorioXLSX(el){
const {lista,titulo,arq}=escopoRel(el);if(!lista.length){toast('Não há cautelas para esse relatório.',true);return;}
const dados=dadosRel(lista),larg={num:8,militar:22,numAluno:12,pelotao:14,situacao:14,itens:34,transfSaida:40,transfEntrada:34,obsDev:30,encerramento:30,obs:26,formaAss:30,pedidoOriginal:30};
const pl=[
{nome:'Cautelas',cab:CAMPOS.map(c=>c[1]),larg:CAMPOS.map(c=>larg[c[0]]||18),linhas:dados.map(d=>CAMPOS.map(c=>d[c[0]]||''))},
{nome:'Itens',cab:['Nº','Militar','Material','Patrimônio','Nº de série','Lote','Quantidade','Situação na devolução'],larg:[8,22,28,14,16,16,11,30],
linhas:dados.flatMap(d=>d.itensLista.map(i=>[d.num,d.militar,i.material,i.pat,i.serie,i.lote,i.qtd,i.sit]))},
{nome:'Andamento',cab:['Nº','Militar da cautela','Data e hora','Evento','Registrado por','Detalhes'],larg:[8,22,17,24,22,60],
linhas:dados.flatMap(d=>d.andamento.map(a=>[d.num,d.militar,a.t,a.a,a.por,a.obs]))},
{nome:'Sobre o relatório',cab:['Campo','Valor'],larg:[24,70],linhas:[['Relatório',titulo],['Gerado em',fmtC(nowISO())],['Gerado por',nomeM(sess.userId)],['Cautelas incluídas',dados.length],['Sistema','SICAM – Furrielação APMG']]}];
baixarArquivo(montarXLSX(pl),`sicam-${arq}-${carimboArq()}.xlsx`);toast('Relatório Excel gerado.');
}
/* ---- PDF ---- */
async function carregarPDFLib(){
if(window.PDFLib)return window.PDFLib;
for(const src of ['https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js','https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js']){
try{await new Promise((res,rej)=>{const sc=document.createElement('script');sc.src=src;sc.onload=res;sc.onerror=rej;document.head.appendChild(sc);});if(window.PDFLib)return window.PDFLib;}catch(e){}
}
throw new Error('Não foi possível carregar o gerador de PDF. Confira a internet e tente de novo.');
}
const winAnsi=s=>String(s==null?'':s).replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/→/g,'->').replace(/✓/g,'OK').replace(/\u202F|\u2009/g,' ').replace(/[^\n\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2022\u20AC]/g,'');
async function relatorioPDF(el){
const {lista,titulo,arq}=escopoRel(el);if(!lista.length){toast('Não há cautelas para esse relatório.',true);return;}
const btn=el;const txt0=btn.textContent;btn.disabled=true;btn.textContent='Gerando…';
try{
const P=await carregarPDFLib();const pdf=await P.PDFDocument.create();
pdf.setTitle(winAnsi('SICAM – '+titulo));pdf.setAuthor(winAnsi(nomeM(sess.userId)));pdf.setCreator('SICAM – Furrielação APMG');
const F1=await pdf.embedFont(P.StandardFonts.Helvetica),F2=await pdf.embedFont(P.StandardFonts.HelveticaBold);
const W=595.28,H=841.89,M=40,verde=P.rgb(0.184,0.239,0.165),cinza=P.rgb(0.36,0.4,0.36),preto=P.rgb(0.1,0.12,0.1),linha=P.rgb(0.8,0.83,0.79);
let pg,y;
const nova=()=>{pg=pdf.addPage([W,H]);y=H-M;};
const quebra=(t,f,s,w)=>{const out=[];for(const par of winAnsi(t).split('\n')){let l='';for(const pal of par.split(' ')){const tt=l?l+' '+pal:pal;if(l&&f.widthOfTextAtSize(tt,s)>w){out.push(l);l=pal;}else l=tt;}out.push(l);}return out;};
const cabe=h=>{if(y-h<M+24)nova();};
const texto=(t,o={})=>{const f=o.f||F1,s=o.s||9,x=o.x||M,w=o.w||(W-2*M),c=o.c||preto;for(const l of quebra(t,f,s,w)){cabe(s*1.35);pg.drawText(l,{x,y:y-s,size:s,font:f,color:c});y-=s*1.35;}};
const kv=(k,v)=>{if(!v)return;const kw=150,ls=quebra(v,F1,9,W-2*M-kw);cabe(12*ls.length);pg.drawText(winAnsi(k),{x:M,y:y-9,size:8.5,font:F2,color:cinza});ls.forEach((l,i)=>pg.drawText(l,{x:M+kw,y:y-9-i*12,size:9,font:F1,color:preto}));y-=12*ls.length+1;};
nova();
pg.drawRectangle({x:0,y:H-78,width:W,height:78,color:verde});
pg.drawText('SICAM',{x:M,y:H-40,size:22,font:F2,color:P.rgb(1,1,1)});
pg.drawText(winAnsi('Cautela de material da Furrielação – APMG'),{x:M,y:H-58,size:10,font:F1,color:P.rgb(0.9,0.93,0.88)});
y=H-96;
texto(titulo,{f:F2,s:14});y-=2;
texto(`Gerado em ${fmtC(nowISO())} por ${nomeM(sess.userId)} · ${lista.length} cautela(s)`,{s:9,c:cinza});y-=8;
for(const d of dadosRel(lista)){
cabe(70);y-=4;pg.drawLine({start:{x:M,y},end:{x:W-M,y},thickness:1.2,color:verde});y-=6;
texto(`${d.num} – ${d.militar}${d.pelotao?' · '+d.pelotao:''}`,{f:F2,s:12});
texto(`Situação: ${d.situacao}`,{f:F2,s:9.5,c:cinza});y-=3;
for(const [k,rot] of CAMPOS.slice(5))kv(rot,d[k]);
if(d.itensLista.length){y-=4;texto('Material',{f:F2,s:10});
for(const i of d.itensLista)texto(`• ${i.lote?`${i.qtd} cart. ${i.material} – lote ${i.lote}`:`${i.material} – patrimônio ${i.pat}${i.serie?' – série '+i.serie:''}`}${i.sit?` (${i.sit})`:''}`,{x:M+8,w:W-2*M-8});}
if(d.andamento.length){y-=4;texto('Andamento (data e hora de cada etapa)',{f:F2,s:10});
for(const a of d.andamento)texto(`${a.t} – ${a.a}${a.por?' – '+a.por:''}${a.obs?': '+a.obs:''}`,{x:M+8,w:W-2*M-8,s:8.5});}
y-=6;
}
const pags=pdf.getPages();pags.forEach((p,i)=>{p.drawLine({start:{x:M,y:30},end:{x:W-M,y:30},thickness:.5,color:linha});
p.drawText(winAnsi(`SICAM – ${titulo}`).slice(0,90),{x:M,y:18,size:7.5,font:F1,color:cinza});
p.drawText(`${i+1} / ${pags.length}`,{x:W-M-30,y:18,size:7.5,font:F1,color:cinza});});
baixarArquivo(new Blob([await pdf.save()],{type:'application/pdf'}),`sicam-${arq}-${carimboArq()}.pdf`);toast('Relatório PDF gerado.');
}catch(e){console.error(e);toast(e.message||'Não foi possível gerar o PDF.',true);}
finally{if(btn.isConnected){btn.disabled=false;btn.textContent=txt0;}}
}

/* ============ Exportar CSV ============ */
function exportarCSV(){
const q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
const when=(r,a)=>{const l=(r.log||[]).find(x=>x.a===a);return l?fmt(l.t):'';};
const rows=[['Nº','Militar','Pelotão','Material','Patrimônios','Finalidade','Retirada prevista','Devolução prevista','Situação','Solicitada','Assinada','Forma de assinatura','Entrega confirmada','Devolvida','Observação']]
.concat([...D.reservas].sort((a,b)=>a.num-b.num).map(r=>[nr(r.num),nomeM(r.userId),user(r.userId).pelotao,itensTxt(r),(r.unidades||[]).map(id=>unid(id)?.pat).concat((r.municao||[]).map(munTxt)).join(' | '),r.finalidade,fmt(r.retirada),fmt(r.devolucao),
atrasada(r)?'Em atraso':(ST[r.status]||[r.status])[0],when(r,'Solicitada'),when(r,'Assinada'),r.assinatura?(METODO[r.assinatura.metodo]||r.assinatura.metodo):'',when(r,'Cautelada'),when(r,'Devolvida'),((r.log||[]).find(l=>l.a==='Devolvida'||l.a==='Recusada')||{}).obs||r.obs]));
const csv='\ufeff'+rows.map(r=>r.map(q).join(';')).join('\r\n');
const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
a.download='sicam-historico-'+new Date().toISOString().slice(0,10)+'.csv';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);
}
/* ============ Eventos ============ */
const acts={
go:el=>{ui.view=el.dataset.v;render();window.scrollTo(0,0);},
fechar:closeModal,
recarregar:()=>location.reload(),
sair:async()=>{closeModal();ui.view=null;ui.cart={};await signOut(auth);},
senha:trocarSenha,
irCadastro:()=>{fase='cadastro';render();},
irLogin:()=>{fase='login';render();},
telaF:()=>{ui.tela='furriel';loginMsg='';fase='login';render();},
telaC:()=>{ui.tela='cadete';loginMsg='';fase='login';render();},
irCadastroF:()=>{fase='cadastroF';render();},
transferir:el=>transferir(el.dataset.id),
devolverCadete:el=>devolverCadete(el.dataset.id),
assBio:()=>assinarComBio(),
ativarBioAqui:async()=>{await ativarBio();if(assPend&&temBioAqui())pedirAssinatura(assPend);},
trfTodos:()=>{document.querySelectorAll('#f-trf input[type=checkbox]').forEach(i=>i.checked=true);},
cartRm:el=>{delete ui.cart[el.dataset.id];atualizarCarrinho();},
cartQ:el=>{const id=el.dataset.id;ui.cart[id]=Math.max(0,Math.min(MAXQ,(ui.cart[id]||0)+(+el.dataset.d)));if(!ui.cart[id])delete ui.cart[id];atualizarCarrinho();},
cartLimpar:()=>{ui.cart={};render();},
sepRm:el=>{const i=document.querySelector(`#f-sep .pick input[value="${el.dataset.id}"]`);if(i){i.checked=false;const q=$('#sep-q');sepFiltrar(q?q.value:'');sepResultados(q?q.value:'');sepContar();}},
cancelarTransf:el=>cancelarTransf(el.dataset.id),
aceitarTransf:el=>aceitarTransf(el.dataset.id),
recusarTransf:el=>recusarTransf(el.dataset.id),
sepSel:el=>sepSelecionar(el.dataset.id),
sepLote:el=>{const i=document.querySelector(`#f-sep .lotes input[data-lid="${el.dataset.id}"]`);if(i){const q=$('#sep-q');if(q)q.value='';sepFiltrar('');sepResultados('');i.focus();i.scrollIntoView({block:'center'});}},
novoMun:()=>formMun(null),
editMun:el=>formMun(tipo(el.dataset.id)),
entMun:el=>{ui.aberto=el.dataset.id;formEntrada(tipo(el.dataset.id));},
ajLote:el=>{const l=loteDe(el.dataset.id);if(l){ui.aberto=l.tipoId;formAjuste(l);}},
sepAuto:()=>{document.querySelectorAll('#f-sep .pick').forEach(g=>{const q=+g.dataset.q;let n=g.querySelectorAll('input:checked').length;
g.querySelectorAll('input:not(:checked)').forEach(i=>{if(n<q){i.checked=true;n++;}});});
document.querySelectorAll('#f-sep .lotes').forEach(g=>{let falta=+g.dataset.q;g.querySelectorAll('input').forEach(i=>{const v=Math.min(falta,+i.dataset.max);i.value=v||'';falta-=v;});});
const s=$('#sep-q');if(s)s.value='';sepFiltrar('');sepContar();},
esqueci:()=>openModal('Esqueci minha senha',`<form id="f-esq" class="stack"><label class="f"><span>E-mail institucional</span><input class="i" name="email" type="email" required autocapitalize="off"></label>
<p class="erro" id="esq-erro"></p><button class="btn btn-pri btn-block">Enviar link para nova senha</button></form>`),
jaConfirmei:async()=>{const u=auth.currentUser;if(!u)return;await u.reload();if(auth.currentUser.emailVerified){await auth.currentUser.getIdToken(true);await aoMudarLogin(auth.currentUser);}else $('#ver-erro').textContent='Ainda não consta a confirmação. Clique no link do e-mail e tente de novo.';},
reenviar:async()=>{try{await sendEmailVerification(auth.currentUser);toast('E-mail reenviado.');}catch(e){toast(e.code==='auth/too-many-requests'?'Aguarde alguns minutos antes de reenviar.':erroFirebase(e),true);}},
liberar:async el=>{await updateDoc(doc(db,'users',el.dataset.id),{ativo:true,pendente:false,liberadoPor:sess.userId,liberadoEm:nowISO()});toast('Acesso liberado.');},
recusarUser:async el=>{if(!confirm('Recusar este cadastro? O militar não conseguirá entrar.'))return;await updateDoc(doc(db,'users',el.dataset.id),{ativo:false,pendente:false});toast('Cadastro recusado.');},
avisos:async()=>{try{await Notification.requestPermission();}catch(e){}render();},
cart:el=>{const id=el.dataset.id,lim=contagem(id).livre>0?MAXQ:(ui.cart[id]||0);ui.cart[id]=Math.max(0,Math.min(lim,(ui.cart[id]||0)+(+el.dataset.d)));render();},
solicitar:abrirSolicitacao,
ver:el=>verReserva(el.dataset.id),
cancelar:el=>cancelar(el.dataset.id),
aprovar:el=>aprovar(el.dataset.id), recusar:el=>recusar(el.dataset.id), separar:el=>separar(el.dataset.id),
cautelar:el=>cautelar(el.dataset.id), devolver:el=>devolver(el.dataset.id),
novoTipo, novoUser,
editTipo:el=>editTipo(el.dataset.id),
delTipo:async el=>{const id=el.dataset.id,t=tipo(id);const us=D.unidades.filter(u=>u.tipoId===id);
if(us.some(u=>['separado','cautelado'].includes(u.status))){toast('Há unidades separadas ou cauteladas. Registre a devolução antes.',true);return;}
if(!confirm(`Excluir "${t.nome}" e ${us.length} unidade(s)? Isso não pode ser desfeito.`))return;
const refs=[doc(db,'tipos',id),...us.map(u=>doc(db,'unidades',u.id))];
for(let i=0;i<refs.length;i+=450){const b=writeBatch(db);refs.slice(i,i+450).forEach(r=>b.delete(r));await b.commit();}
closeModal();toast('Material excluído.');},
importar:abrirImportar,
impConfirmar:el=>confirmarImportacao(el),
cat:el=>{ui.cat=el.dataset.c;render();},
assinar:el=>assinar(el.dataset.id),
assinarBio:el=>assinarBio(el.dataset.id),
ativarBio:()=>ativarBio(),
confirmarEntrega:el=>confirmarEntrega(el.dataset.id),
novaUnid:async el=>{const t=tipo(el.dataset.id);const n=D.unidades.filter(u=>u.tipoId===t.id).length+1;
const pat=prompt('Nº de patrimônio da nova unidade',(t.prefixo||'UN')+'-'+String(n).padStart(3,'0'));if(!pat)return;
if(D.unidades.some(u=>u.pat.toLowerCase()===pat.trim().toLowerCase())){toast('Esse patrimônio já está cadastrado.',true);return;}
ui.aberto=t.id;await setDoc(doc(collection(db,'unidades')),{tipoId:t.id,pat:pat.trim(),status:'disponivel'});toast(`${pat.trim()} adicionado a ${t.nome}.`);},
toggleUser:async el=>{const u=user(el.dataset.id);await updateDoc(doc(db,'users',u.id),{ativo:!u.ativo,pendente:false});},
csv:exportarCSV,
relPDF:el=>relatorioPDF(el),
histTudo:el=>carregarHistoricoCompleto(el),
relXLS:el=>relatorioXLSX(el)
};
document.addEventListener('click',async e=>{
const el=e.target.closest('[data-act]');if(!el)return;
const f=acts[el.dataset.act];if(!f)return;
e.preventDefault();
try{await f(el);}catch(err){console.error(err);toast(erroFirebase(err),true);}
});
document.addEventListener('toggle',e=>{if(e.target.matches&&e.target.matches('details.tipo')&&e.target.open)ui.aberto=e.target.dataset.tipo;},true);
const forms={
'f-login':async(fd,f)=>{loginMsg='';ui.telaLogin=f.dataset.tela||'cadete';
try{await signInWithEmailAndPassword(auth,emailDe(fd.get('login')),fd.get('senha'));}
catch(e){$('#login-erro').textContent=erroFirebase(e);}},
'f-setup':async fd=>{
const login=normLogin(fd.get('login'));
if(!/^[a-z0-9._-]+$/.test(login)){$('#setup-erro').textContent='Usuário só pode ter letras, números, ponto ou hífen.';return;}
bootstrapping=true;
try{
const cred=await createUserWithEmailAndPassword(auth,emailDe(login),fd.get('senha'));
const uid=cred.user.uid;
const b=writeBatch(db);
b.set(doc(db,'users',uid),{login,nome:String(fd.get('nome')).trim(),grad:String(fd.get('grad')).trim(),pelotao:'Furrielação',perfil:'furriel',ativo:true,criadoEm:nowISO()});
b.set(doc(db,'config','setup'),{feito:true,em:nowISO(),por:uid});
b.set(doc(db,'config','contador'),{seq:0});
await b.commit();
if(fd.get('exemplo'))await carregarExemplo();
bootstrapping=false;await aoMudarLogin(auth.currentUser);
}catch(e){bootstrapping=false;$('#setup-erro').textContent=erroFirebase(e);}
},
'f-sol':fd=>enviarSolicitacao(fd),
'f-rec':async(fd,f)=>{const r=R(f.dataset.id);await updateDoc(doc(db,'reservas',r.id),{status:'recusada',log:[...r.log,entrada('Recusada',String(fd.get('m')).trim())]});closeModal();toast(`${nr(r.num)} recusada.`);},
'f-sep':(fd,f)=>confirmarSeparacao(f),
'f-trf':(fd,f)=>confirmarTransf(f,fd),
'f-ass':fd=>assinarComSenha(fd),
'f-devbalcao':(fd,f)=>devolucaoBalcao(f,fd),
'f-aceite':(fd,f)=>confirmarAceite(f,fd),
'f-mun':async(fd,f)=>{const nome=String(fd.get('nome')).trim(),desc=String(fd.get('desc')||'').trim(),limite=Math.max(1,parseInt(fd.get('lim'),10)||100),oculto=!fd.get('vis');
if(f.dataset.id){await updateDoc(doc(db,'tipos',f.dataset.id),{nome,desc,limite,oculto});closeModal();toast('Calibre atualizado.');return;}
const tref=doc(collection(db,'tipos')),b=writeBatch(db),lote=String(fd.get('lote')).trim(),q=Math.max(0,parseInt(fd.get('q'),10)||0);
b.set(tref,{nome,desc,mun:true,categoria:'Munição',limite,oculto,ordem:D.tipos.length,prefixo:''});
b.set(doc(collection(db,'lotes')),{tipoId:tref.id,lote,qtd:q,movs:[{t:nowISO(),tipo:'Entrada',qtd:q,por:sess.userId,obs:'Cadastro'}]});
await b.commit();ui.aberto=tref.id;closeModal();toast('Munição cadastrada.');},
'f-ent':async(fd,f)=>{const t=tipo(f.dataset.id),lote=String(fd.get('lote')).trim(),q=parseInt(fd.get('q'),10),obs=String(fd.get('obs')||'').trim();if(!lote||!(q>0))return;
const ex=lotesDe(t.id).find(l=>normTxt(l.lote)===normTxt(lote));const mov={t:nowISO(),tipo:'Entrada',qtd:q,por:sess.userId,obs};
if(ex){await runTransaction(db,async tx=>{const s=await tx.get(doc(db,'lotes',ex.id));const d=s.data()||{};tx.update(doc(db,'lotes',ex.id),{qtd:(d.qtd||0)+q,movs:[...(d.movs||[]),mov].slice(-40)});});}
else await setDoc(doc(collection(db,'lotes')),{tipoId:t.id,lote,qtd:q,movs:[mov]});
closeModal();toast(`Entrada de ${q} cartuchos no lote ${lote}.`);},
'f-aj':async(fd,f)=>{const l=loteDe(f.dataset.id),q=parseInt(fd.get('q'),10);if(!l||!(q>=0))return;
await runTransaction(db,async tx=>{const s=await tx.get(doc(db,'lotes',l.id));const d=s.data()||{};const dif=q-(d.qtd||0);
tx.update(doc(db,'lotes',l.id),{qtd:q,movs:[...(d.movs||[]),{t:nowISO(),tipo:'Ajuste',qtd:dif,por:sess.userId,obs:String(fd.get('obs')).trim()}].slice(-40)});});
closeModal();toast(`Lote ${l.lote} ajustado.`);},
'f-cadf':async fd=>{
const email=String(fd.get('email')||'').trim().toLowerCase(),senha=String(fd.get('senha'));
if(!dominioOk(email)){$('#cadf-erro').textContent=`Use o e-mail institucional (terminado em @${DOMINIOS.join(' ou @')}).`;return;}
if(senha!==String(fd.get('senha2'))){$('#cadf-erro').textContent='As duas senhas não são iguais.';return;}
if(senha.length<8){$('#cadf-erro').textContent='A senha do Furriel precisa ter ao menos 8 caracteres.';return;}
bootstrapping=true;let cred;
try{
cred=await createUserWithEmailAndPassword(auth,email,senha);
await setDoc(doc(db,'users',cred.user.uid),{login:email.split('@')[0],email,nome:String(fd.get('nome')).trim(),grad:String(fd.get('grad')).trim(),pelotao:'Furrielação',perfil:'furriel',ativo:false,pendente:true,criadoEm:nowISO()});
try{await sendEmailVerification(cred.user);}catch(e){}
bootstrapping=false;ui.telaLogin='furriel';await aoMudarLogin(auth.currentUser);
}catch(e){
bootstrapping=false;
if(cred&&e.code!=='auth/email-already-in-use'){try{await cred.user.delete();}catch(x){}}
$('#cadf-erro').textContent=e.code==='auth/email-already-in-use'?'Esse e-mail já tem conta. Use "Esqueci minha senha" se precisar.':erroFirebase(e);
}
},
'f-caut':(fd,f)=>confirmarCautela(f,fd),
'f-assinar':(fd,f)=>assinarSenha(f,fd),

'f-dev':(fd,f)=>confirmarDevolucao(f,fd),
'f-tipo':async fd=>{const tref=doc(collection(db,'tipos')),pre=String(fd.get('pre')).trim().toUpperCase();
const q=Math.max(1,Math.min(300,+fd.get('q')||1));const b=writeBatch(db);
b.set(tref,{nome:String(fd.get('nome')).trim(),categoria:String(fd.get('cat')),prefixo:pre,desc:String(fd.get('desc')||'').trim(),ordem:D.tipos.length,oculto:!fd.get('vis')});
for(let k=1;k<=q;k++)b.set(doc(db,'unidades',tref.id+'_'+k),{tipoId:tref.id,pat:pre+'-'+String(k).padStart(3,'0'),status:'disponivel'});
await b.commit();closeModal();toast('Material cadastrado.');},
'f-edtipo':async(fd,f)=>{await updateDoc(doc(db,'tipos',f.dataset.id),{nome:String(fd.get('nome')).trim(),categoria:String(fd.get('cat')),desc:String(fd.get('desc')||'').trim(),oculto:!fd.get('vis')});closeModal();toast('Material atualizado.');},
'f-user':async fd=>{
const email=emailDe(fd.get('login'));
if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){$('#user-erro').textContent='Informe um e-mail válido.';return;}
if(D.users.some(u=>emailUser(u)===email)){$('#user-erro').textContent='Já existe um militar com esse e-mail.';return;}
let novo;
try{novo=await comAuthSecundario(async a2=>{const c=await createUserWithEmailAndPassword(a2,email,String(fd.get('senha')));if(!ehLegado(email)){try{await sendEmailVerification(c.user);}catch(e){}}return c.user.uid;});}
catch(e){$('#user-erro').textContent=erroFirebase(e);return;}
await setDoc(doc(db,'users',novo),{login:String(fd.get('num')||'').trim()||email.split('@')[0],email,nome:String(fd.get('nome')).trim(),grad:String(fd.get('grad')).trim(),pelotao:String(fd.get('pel')).trim(),perfil:fd.get('perfil'),ativo:true,pendente:false,criadoEm:nowISO()});
closeModal();toast(`Militar cadastrado: ${email}`);},
'f-cad':async fd=>{
const email=String(fd.get('email')||'').trim().toLowerCase(), senha=String(fd.get('senha'));
if(!dominioOk(email)){$('#cad-erro').textContent=`Use seu e-mail institucional (terminado em @${DOMINIOS.join(' ou @')}).`;return;}
if(senha!==String(fd.get('senha2'))){$('#cad-erro').textContent='As duas senhas não são iguais.';return;}
bootstrapping=true;let cred;
try{
cred=await createUserWithEmailAndPassword(auth,email,senha);
await setDoc(doc(db,'users',cred.user.uid),{login:String(fd.get('num')).trim(),email,nome:String(fd.get('nome')).trim(),grad:String(fd.get('grad')).trim(),
pelotao:String(fd.get('pel')).trim(),perfil:'aluno',ativo:false,pendente:true,criadoEm:nowISO()});
try{await sendEmailVerification(cred.user);}catch(e){}
bootstrapping=false;await aoMudarLogin(auth.currentUser);
}catch(e){
bootstrapping=false;
if(cred&&e.code!=='auth/email-already-in-use'){try{await cred.user.delete();}catch(x){}}
$('#cad-erro').textContent=e.code==='auth/email-already-in-use'?'Esse e-mail já tem conta. Use "Já tenho conta" ou "Esqueci minha senha".':erroFirebase(e);
}
},
'f-esq':async fd=>{
const email=emailDe(fd.get('email'));
if(ehLegado(email)){$('#esq-erro').textContent='Contas antigas (sem e-mail) não recebem link. Procure a Furrielação.';return;}
try{await sendPasswordResetEmail(auth,email);}catch(e){if(e.code==='auth/invalid-email'){$('#esq-erro').textContent='E-mail inválido.';return;}}
closeModal();toast('Se esse e-mail tiver conta, chega um link para criar nova senha. Confira também o spam.');
},
'f-senha':async fd=>{
try{const u=auth.currentUser;await reauthenticateWithCredential(u,EmailAuthProvider.credential(u.email,fd.get('atual')));await updatePassword(u,String(fd.get('nova')));closeModal();toast('Senha alterada.');}
catch(e){$('#senha-erro').textContent=(e.code==='auth/invalid-credential'||e.code==='auth/wrong-password')?'Senha atual incorreta.':erroFirebase(e);}
}
};
document.addEventListener('submit',async e=>{
const f=forms[e.target.id];if(!f)return;e.preventDefault();
const btn=e.target.querySelector('button:not([type=button])');if(btn){if(btn.disabled)return;btn.disabled=true;}
try{await f(new FormData(e.target),e.target);}catch(err){console.error(err);toast(erroFirebase(err),true);}
finally{if(btn&&btn.isConnected)btn.disabled=false;}
});
document.addEventListener('change',async e=>{
if(e.target.id==='imp-file'&&e.target.files&&e.target.files[0]){previaImportacao(e.target.files[0]);return;}
const k=e.target.dataset&&e.target.dataset.chg;if(!k)return;
if(k==='ustat'){try{ui.aberto=unid(e.target.dataset.id)?.tipoId;await updateDoc(doc(db,'unidades',e.target.dataset.id),{status:e.target.value});}catch(err){toast(erroFirebase(err),true);}}
if(k==='fs'){ui.fs=e.target.value;$('#hist-t').innerHTML=tabHist(histFiltrado());}
if(k==='mun'){const t=tipo(e.target.dataset.id),lim=t.limite||100;let v=parseInt(e.target.value,10)||0;v=Math.max(0,Math.min(lim,v));
if(v>0&&!ui.cart[t.id]&&contagem(t.id).livre<=0)v=0;ui.cart[t.id]=v;render();}
});
document.addEventListener('change',e=>{if(e.target.closest&&e.target.closest('#f-sep .pick'))sepContar();});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='sep-q'){e.preventDefault();sepEnter(e.target);}});
document.addEventListener('input',e=>{
if(e.target.id==='sep-q'){sepFiltrar(e.target.value);sepResultados(e.target.value);$('#sep-erro').textContent='';return;}
if(e.target.closest&&e.target.closest('#f-sep .lotes')){sepContar();return;}
if(e.target.dataset&&e.target.dataset.inpmun){const b=e.target.closest('.dev-mun'),q=+b.dataset.q,d=parseInt(e.target.value,10)||0,c=b.querySelector('.calc');const bad=d<0||d>q;
c.textContent=bad?`A sobra não pode passar de ${q} cartuchos.`:d?`Utilizados: ${q-d} · sobra devolvida: ${d}`:`Sem sobra: ${q} cartuchos utilizados.`;c.classList.toggle('bad',bad);return;}
if(e.target.dataset&&e.target.dataset.inp==='mq'){ui.mq=e.target.value;const box=$('#mat-res');if(box){const tmp=document.createElement('div');tmp.innerHTML=vMaterial();box.replaceWith(tmp.querySelector('#mat-res'));}return;}
if(e.target.dataset&&e.target.dataset.inp==='busca'){ui.busca=e.target.value;render();return;}
if(e.target.dataset&&e.target.dataset.inp==='q'){ui.q=e.target.value;$('#hist-t').innerHTML=tabHist(histFiltrado());}});
/* ============ Firebase: sessão e dados ao vivo ============ */
function pararEscutas(){unsubs.forEach(u=>{try{u();}catch(e){}});unsubs=[];loaded={};}
let catTimer=null;
/* O painel do Furriel publica dois resumos, cada um num único documento:
   config/catalogo  – tipos de material (sem quantidades) e se estão disponíveis;
   config/diretorio – nome, graduação e pelotão dos militares ativos.
   Assim o celular do cadete lê 2 documentos em vez de centenas. */
function publicarCatalogo(){
clearTimeout(catTimer);catTimer=setTimeout(async()=>{
if(!ehFurriel()||fase!=='app')return;
const disp={};D.tipos.filter(t=>!t.oculto).forEach(t=>{disp[t.id]=contagem(t.id).livre>0;});
const tipos=D.tipos.map(t=>({id:t.id,nome:t.nome||'',categoria:t.categoria||'',desc:t.desc||'',mun:!!t.mun,limite:t.limite||0,oculto:!!t.oculto,ordem:t.ordem??99}));
const cat=D.catDoc||{};
if(JSON.stringify(disp)!==JSON.stringify(cat.disp||{})||JSON.stringify(tipos)!==JSON.stringify(cat.tipos||null)){
try{await setDoc(doc(db,'config','catalogo'),{disp,tipos,em:nowISO()});}catch(e){console.warn('catálogo',e);}}
const militares=D.users.filter(u=>u.ativo&&!u.pendente).map(u=>({id:u.id,nome:u.nome||'',grad:u.grad||'',pelotao:u.pelotao||'',perfil:u.perfil||'aluno'})).sort((a,b)=>a.id.localeCompare(b.id));
if(JSON.stringify(militares)!==JSON.stringify((D.dirDoc||{}).militares||null)){
try{await setDoc(doc(db,'config','diretorio'),{militares,em:nowISO()});}catch(e){console.warn('diretório',e);}}
},700);
}
let uinfoFeito=false;
async function completarUinfo(){
if(uinfoFeito||!ehFurriel())return;uinfoFeito=true;
for(const r of D.reservas.filter(r=>['separada','cautelada'].includes(r.status)&&(r.unidades||[]).length&&!r.uinfo)){
const uinfo={};r.unidades.forEach(id=>{const x=infoUnid(id);if(x)uinfo[id]=x;});
try{await updateDoc(doc(db,'reservas',r.id),{uinfo});}catch(e){console.warn('uinfo',e);}
}
}
const ordenarTipos=arr=>arr.sort((a,b)=>(a.ordem??99)-(b.ordem??99)||String(a.nome).localeCompare(String(b.nome)));
const normRes=arr=>{arr.forEach(r=>{r.log=r.log||[];r.unidades=r.unidades||[];r.itens=r.itens||[];});return arr;};
const baldes={resA:[],resB:[],resTudo:[]};
function juntarReservas(){const m=new Map();[...baldes.resTudo,...baldes.resB,...baldes.resA].forEach(r=>m.set(r.id,r));return [...m.values()];}
async function carregarHistoricoCompleto(btn){
if(histTudo)return;if(btn){btn.disabled=true;btn.textContent='Carregando…';}
try{const sn=await getDocs(collection(db,'reservas'));baldes.resTudo=normRes(sn.docs.map(d=>({id:d.id,...d.data()})));histTudo=true;D.reservas=juntarReservas();render();toast('Histórico completo carregado.');}
catch(e){console.error(e);toast(erroFirebase(e),true);if(btn){btn.disabled=false;btn.textContent='Carregar histórico completo';}}
}
function avisosReservas(snap){
const eu=me();
snap.docChanges().forEach(ch=>{if(ch.type!=='modified'||!eu||eu.perfil!=='furriel')return;const r={id:ch.doc.id,...ch.doc.data()};const old=D.reservas.find(x=>x.id===r.id);
if(r.devAssCadete&&old&&!old.devAssCadete){avisar(`${nr(r.num)}: devolução assinada`,`${nomeM(r.userId)} assinou a devolução. Confira o material e assine.`);if(ui.devAguardando===r.id&&modal.open)setTimeout(()=>devolver(r.id),300);}});
snap.docChanges().forEach(ch=>{
const r={id:ch.doc.id,...ch.doc.data()};
if(eu&&eu.perfil==='furriel'&&ch.type==='added'&&r.status==='pendente'&&r.userId!==eu.id)
avisar(`Nova solicitação ${nr(r.num)}`,`${nomeM(r.userId)}: ${itensTxt(r)}`);
if(eu&&eu.perfil==='furriel'&&ch.type==='added'&&r.origem){const o=D.reservas.find(x=>x.id===r.origem);avisar(`Cautela transferida ${nr(r.num)}`,`${o?nomeM(o.userId):'?'} → ${nomeM(r.userId)}: ${itensTxt(r)}`);}
if(eu&&eu.perfil!=='furriel'&&ch.type==='added'&&r.origem&&r.userId===eu.id)avisar(`Você recebeu a cautela ${nr(r.num)}`,itensTxt(r));
if(eu&&eu.perfil==='furriel'&&ch.type==='modified'&&r.status==='separada'&&r.assinatura&&!(D.reservas.find(x=>x.id===r.id)||{}).assinatura)
avisar(`${nr(r.num)} assinada`,`${nomeM(r.userId)} assinou a retirada. Confira e confirme a entrega.`);
if(eu&&eu.perfil!=='furriel'&&ch.type==='modified'&&r.userId===eu.id){
const old=D.reservas.find(x=>x.id===r.id);
if(old&&old.transferPara&&!r.transferPara){const ult=(r.log||[]).slice(-1)[0]||{};if(ult.a==='Transferência recusada')avisar('Transferência recusada',`${nomeM(old.transferPara)} recusou a transferência de ${nr(r.num)}.`);else if(ult.a!=='Transferência cancelada')avisar('Transferência aceita',`${nomeM(old.transferPara)} aceitou e assinou o recebimento.`);}
if(old&&old.status!==r.status&&r.status!=='cancelada'&&r.status!=='transferida')avisar(`Solicitação ${nr(r.num)}`,(ST[r.status]||[r.status])[0]);
}
});
}
function escutarTudo(perfil){
const furr=perfil==='furriel',uid=sess.userId;
histTudo=false;baldes.resA=[];baldes.resB=[];baldes.resTudo=[];
const corte=new Date(Date.now()-JANELA_DIAS*864e5).toISOString();
const fontes=furr?[['users',collection(db,'users')],['tipos',collection(db,'tipos')],['unidades',collection(db,'unidades')],
['resA',query(collection(db,'reservas'),where('status','in',['pendente','aprovada','separada','cautelada']))],
['resB',query(collection(db,'reservas'),where('retirada','>=',corte))],
['lotes',collection(db,'lotes')],['catalogo',doc(db,'config','catalogo')],['diretorio',doc(db,'config','diretorio')]]
:[['eu',doc(db,'users',uid)],['diretorio',doc(db,'config','diretorio')],['catalogo',doc(db,'config','catalogo')],
['reservas',query(collection(db,'reservas'),where('userId','==',uid))],['transfIn',query(collection(db,'reservas'),where('transferPara','==',uid))]];
const cols=fontes.map(f=>f[0]);
let euDoc=null,dirLista=null,reserva={tipos:false,users:false};
const montarUsuarios=()=>{if(furr)return;const base=(dirLista||[]).map(x=>({...x,ativo:true,pendente:false}));const i=base.findIndex(x=>x.id===uid);
if(euDoc){if(i>=0)base[i]=euDoc;else base.push(euDoc);}D.users=base;};
fontes.forEach(([nome,ref])=>{
const pronto=()=>{if(loaded[nome])return;loaded[nome]=true;if(cols.every(c=>loaded[c])){fase='app';render();if(furr){publicarCatalogo();completarUinfo();}}};
const depois=prim=>{if(prim)pronto();else if(fase==='app'){if(!modal.open)render();else if(ehFurriel())render();if(furr)publicarCatalogo();}};
if(nome==='catalogo'){
unsubs.push(onSnapshot(ref,async sn=>{const prim=!loaded[nome];const c=sn.exists()?(sn.data()||{}):{};D.catDoc=c;D.catalogo=c.disp||{};
if(!furr){
if(Array.isArray(c.tipos))D.tipos=ordenarTipos(c.tipos.map(t=>({...t})));
else if(!reserva.tipos){reserva.tipos=true;try{const t=await getDocs(collection(db,'tipos'));D.tipos=ordenarTipos(t.docs.map(d=>({id:d.id,...d.data()})));}catch(e){console.warn('tipos',e);}}}
if(prim)pronto();else if(fase==='app'&&!modal.open)render();},
err=>{console.warn('catálogo',err);D.catalogo={};pronto();}));
return;}
if(nome==='diretorio'){
unsubs.push(onSnapshot(ref,async sn=>{const prim=!loaded[nome];const d=sn.exists()?(sn.data()||{}):{};D.dirDoc=d;
if(!furr){
if(Array.isArray(d.militares))dirLista=d.militares;
else if(!reserva.users){reserva.users=true;try{const u=await getDocs(collection(db,'users'));dirLista=u.docs.map(x=>({id:x.id,...x.data()})).filter(x=>x.ativo&&!x.pendente).map(x=>({id:x.id,nome:x.nome,grad:x.grad||'',pelotao:x.pelotao||'',perfil:x.perfil}));}catch(e){console.warn('militares',e);dirLista=[];}}
montarUsuarios();}
if(prim)pronto();else if(fase==='app'&&!modal.open)render();},
err=>{console.warn('diretório',err);if(!furr){dirLista=dirLista||[];montarUsuarios();}pronto();}));
return;}
if(nome==='eu'){
unsubs.push(onSnapshot(ref,sn=>{const prim=!loaded[nome];euDoc=sn.exists()?{id:sn.id,...sn.data()}:null;montarUsuarios();
if(!euDoc||!euDoc.ativo){loginMsg='Seu acesso foi desativado. Procure a Furrielação.';signOut(auth);return;}
depois(prim);},err=>{console.error(err);loginMsg='Sem permissão de acesso. Procure a Furrielação.';signOut(auth);}));
return;}
if(nome==='transfIn'){
unsubs.push(onSnapshot(ref,snap=>{const prim=!loaded[nome];
if(!prim)snap.docChanges().forEach(ch=>{if(ch.type==='added'){const r=ch.doc.data();avisar('Pedido de transferência',`${nomeM(r.userId)} quer transferir material para você. Abra o SICAM para aceitar.`);}});
D.transfIn=snap.docs.map(d=>({id:d.id,...d.data()}));if(prim)pronto();else if(fase==='app'&&!modal.open)render();},
err=>{console.warn('transferências',err);D.transfIn=[];pronto();}));
return;}
const un=onSnapshot(ref,snap=>{
const primeira=!loaded[nome];
if(nome==='users'&&!primeira){const eu=me();if(eu&&eu.perfil==='furriel')snap.docChanges().forEach(ch=>{const u=ch.doc.data();if(u.pendente&&(ch.type==='added'||(ch.type==='modified'&&!(D.users.find(x=>x.id===ch.doc.id)||{}).pendente)))avisar(u.perfil==='furriel'?'Pedido de conta de Furriel':'Novo cadastro para liberar',`${u.grad||''} ${u.nome} – ${u.pelotao||''}`);});}
if(!primeira&&(nome==='reservas'||nome==='resA'))avisosReservas(snap);
let arr=snap.docs.map(d=>({id:d.id,...d.data()}));
if(nome==='tipos')ordenarTipos(arr);
if(nome==='unidades')arr.sort((a,b)=>String(a.pat).localeCompare(String(b.pat),'pt-BR',{numeric:true}));
if(nome==='lotes')arr.sort((a,b)=>String(a.lote).localeCompare(String(b.lote),'pt-BR',{numeric:true}));
if(nome==='reservas'||nome==='resA'||nome==='resB')normRes(arr);
if(nome==='resA'||nome==='resB'){baldes[nome]=arr;D.reservas=juntarReservas();}
else D[nome]=arr;
if(nome==='reservas'&&!furr)D.unidades=Object.entries(arr.reduce((a,r)=>Object.assign(a,r.uinfo||{}),{})).map(([id,x])=>({id,...x}));
if(nome==='users'){const eu=me();if(eu&&!eu.ativo){loginMsg='Seu acesso foi desativado. Procure a Furrielação.';signOut(auth);return;}}
depois(primeira);
},err=>{console.error(err);if(err.code==='permission-denied'){loginMsg='Sem permissão de acesso. Procure a Furrielação.';signOut(auth);}else toast(erroFirebase(err),true);});
unsubs.push(un);
});
}
async function setupFeito(){const s=await getDoc(doc(db,'config','setup'));return s.exists();}
async function aoMudarLogin(u){
if(bootstrapping)return;
pararEscutas();closeModal();if(aguardandoUnsub){aguardandoUnsub();aguardandoUnsub=null;}
try{
if(!u){sess=null;D=D0();const f=(await setupFeito())?'login':'setup';fase=((fase==='cadastro'||fase==='cadastroF')&&f==='login')?fase:f;document.title='SICAM';render();return;}
if(!ehLegado(u.email)&&!u.emailVerified){fase='verificar';render();return;}
fase='carregando';render();
const s=await getDoc(doc(db,'users',u.uid));
if(!s.exists()){loginMsg='Conta sem cadastro no sistema. Crie sua conta de novo ou procure a Furrielação.';await signOut(auth);return;}
if(ui.telaLogin){const t=ui.telaLogin;ui.telaLogin=null;const ehF=s.data().perfil==='furriel';if(t==='furriel'?!ehF:ehF){loginMsg='E-mail ou senha incorretos.';await signOut(auth);return;}}
if(s.data().pendente){fase='aguardando';render();
aguardandoUnsub=onSnapshot(doc(db,'users',u.uid),d=>{const x=d.data();if(x&&x.ativo){aguardandoUnsub&&aguardandoUnsub();aguardandoUnsub=null;aoMudarLogin(auth.currentUser);}
else if(x&&!x.pendente&&!x.ativo){loginMsg='Seu cadastro não foi liberado. Procure a Furrielação.';signOut(auth);}},()=>{});
return;}
if(!s.data().ativo){loginMsg='Seu acesso foi desativado. Procure a Furrielação.';await signOut(auth);return;}
sess={userId:u.uid};ui.view=null;uinfoFeito=false;escutarTudo(s.data().perfil);
}catch(e){console.error(e);erroMsg=erroFirebase(e);fase='erro';render();}
}
/* ============ Render ============ */
function render(){
const ae=document.activeElement, keep=ae&&ae.dataset&&ae.dataset.inp, pos=keep?ae.selectionStart:0;
let html;
if(fase==='naoconfig')html=vNaoConfig();
else if(fase==='erro')html=vErro();
else if(fase==='carregando')html=vCarregando();
else if(fase==='setup')html=vSetup();
else if(fase==='cadastro')html=vCadastro();
else if(fase==='cadastroF')html=vCadastroF();
else if(fase==='verificar')html=vVerificar();
else if(fase==='aguardando')html=vAguardando();
else if(fase==='login'||!sess||!me())html=fase==='app'?vCarregando():(ui.tela==='furriel'?vLoginFurriel():vLogin());
else html=me().perfil==='furriel'?vAdmin():vApp();
$('#app').innerHTML=html;
if(keep){const el=document.querySelector(`[data-inp="${keep}"]`);if(el){el.focus();try{el.setSelectionRange(pos,pos);}catch(e){}}}
}
render();
if(configurado){
try{
app=initializeApp(SICAM_FIREBASE);auth=getAuth(app);try{auth.useDeviceLanguage();}catch(e){}
const ehSafari=/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)||(/Safari\//.test(navigator.userAgent)&&!/Chrome|Chromium|Android/.test(navigator.userAgent));
try{db=ehSafari?initializeFirestore(app,{experimentalForceLongPolling:true}):getFirestore(app);}catch(e){db=getFirestore(app);}
onAuthStateChanged(auth,aoMudarLogin);
}catch(e){erroMsg=erroFirebase(e);fase='erro';render();}
}
setInterval(()=>{if(fase==='app'&&!modal.open&&!(document.activeElement&&document.activeElement.matches('input,select,textarea')))render();},60000);
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
