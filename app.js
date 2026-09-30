import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, initializeAuth, inMemoryPersistence, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, reauthenticateWithCredential, EmailAuthProvider, updatePassword, sendEmailVerification, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, onSnapshot, writeBatch, runTransaction } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import * as CFG from './config.js';
const SICAM_FIREBASE=CFG.SICAM_FIREBASE;
const DOMINIOS=((CFG.SICAM_OPCOES&&CFG.SICAM_OPCOES.dominios)||['pm.pr.gov.br']).map(d=>d.toLowerCase());

/* ============ Estado ============ */
const $=s=>document.querySelector(s);
const configurado=SICAM_FIREBASE&&SICAM_FIREBASE.apiKey&&!/COLE/i.test(SICAM_FIREBASE.apiKey);
let app,auth,db;
let fase=configurado?'carregando':'naoconfig'; // naoconfig | carregando | setup | login | cadastro | verificar | aguardando | app | erro
let erroMsg='', loginMsg='';
let D={users:[],tipos:[],unidades:[],reservas:[]};
let sess=null, bootstrapping=false, unsubs=[], loaded={};
const ui={view:null,cart:{},q:'',fs:'todos'};

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
const itensTxt=r=>(r.itens||[]).map(i=>i.qtd+'× '+tipo(i.tipoId).nome).join(', ');
const itensLi=r=>'<ul class="itens">'+(r.itens||[]).map(i=>`<li><b>${i.qtd}×</b><span>${esc(tipo(i.tipoId).nome)}</span></li>`).join('')+'</ul>';
const ST={pendente:['Pendente','c-brass'],aprovada:['Aprovada','c-blue'],separada:['Pronta para retirada','c-blue'],
  cautelada:['Cautelado','c-ok'],devolvida:['Devolvido','c-muted'],recusada:['Recusada','c-stamp'],cancelada:['Cancelada','c-muted']};
const stamp=(r,lg)=>assinada(r)?`<span class="stamp c-ok${lg?' lg':''}">Assinada</span>`:atrasada(r)?`<span class="stamp c-stamp${lg?' lg':''}">Em atraso</span>`:`<span class="stamp ${(ST[r.status]||['?',''])[1]}${lg?' lg':''}">${(ST[r.status]||[r.status])[0]}</span>`;

function contagem(tipoId){
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
  </div></main>`;
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
  const n=Object.values(ui.cart).reduce((a,b)=>a+b,0);
  return `<header class="m-top"><div class="wrap"><p>${esc(nomeM(u.id))} · ${esc(u.pelotao)}</p><h1>${title}</h1><p>${sub}</p></div></header>
  <main class="m-main">${body}</main>
  ${v==='equip'&&n?`<div class="cartbar"><div class="in"><span>${n} ${n>1?'itens selecionados':'item selecionado'}</span><button class="btn" data-act="solicitar">Solicitar</button></div></div>`:''}
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
  if(prontas.length)h+=`<div class="sec-h"><h2>Pronto para retirada</h2></div>`+prontas.map(r=>`<div class="card active-cautela" style="margin-bottom:.6rem;border-left-color:var(--blue)">
    <div class="card-t"><div><span class="nr">${nr(r.num)}</span>${itensLi(r)}</div>${stamp(r)}</div>
    ${r.assinatura?`<p class="small muted" style="margin-top:.5rem">Você assinou às ${fmt(r.assinatura.em)}. Aguarde o Furriel confirmar a entrega.</p>`
      :`<p class="small" style="margin-top:.5rem">Na Furrielação, confira o material e assine a retirada.</p><button class="btn btn-pri btn-block" style="margin-top:.6rem" data-act="assinar" data-id="${r.id}">Assinar retirada</button>`}</div>`).join('');
  if(comigo.length){
    h+=`<div class="sec-h"><h2>Cautelado com você</h2></div>`+comigo.map(r=>`<button class="card clickable active-cautela${atrasada(r)?' late':''}" data-act="ver" data-id="${r.id}" style="margin-bottom:.6rem">
      <div class="card-t"><div><span class="nr">${nr(r.num)}</span>${itensLi(r)}</div>${stamp(r)}</div>
      <p class="small ${atrasada(r)?'c-stamp':'muted'}" style="margin-top:.4rem">Devolver até ${fmt(r.devolucao)}</p></button>`).join('');
    h+=`<div class="sec-h"><h2>Material da Furrielação</h2></div>`;
  }
  const vis=D.tipos.filter(t=>!t.oculto);
  if(!vis.length)return h+'<div class="empty">Nenhum material cadastrado ainda.</div>';
  const cats=catsPresentes(vis);if(ui.cat&&ui.cat!=='Todos'&&!cats.includes(ui.cat))ui.cat='Todos';
  const q=normTxt(ui.busca);
  const cardT=t=>{const c=contagem(t.id), qn=ui.cart[t.id]||0, pct=x=>c.total?(x/c.total*100):0;
    return `<div class="card eq">
      <div><h3>${esc(t.nome)}</h3><p class="avail${c.livre?'':' zero'}"><b>${c.livre}</b> de ${c.total} disponíveis${t.desc?' – '+esc(t.desc):''}</p></div>
      <div class="stepper" role="group" aria-label="Quantidade de ${esc(t.nome)}">
        <button data-act="cart" data-id="${t.id}" data-d="-1" ${qn?'':'disabled'} aria-label="Diminuir">−</button>
        <output>${qn}</output>
        <button data-act="cart" data-id="${t.id}" data-d="1" ${qn<c.livre?'':'disabled'} aria-label="Aumentar">+</button>
      </div>
      <div class="gauge" aria-hidden="true"><i class="g-free" style="width:${pct(c.livre)}%"></i><i class="g-res" style="width:${pct(c.reservado+c.separado)}%"></i><i class="g-out" style="width:${pct(c.cautelado)}%"></i><i class="g-man" style="width:${pct(c.manutencao+c.extraviado)}%"></i></div>
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
  h+=`<div class="legend"><span><i class="g-free"></i>Disponível</span><span><i class="g-res"></i>Reservado</span><span><i class="g-out"></i>Cautelado</span><span><i class="g-man"></i>Manutenção</span></div>`;
  return h;
}
function cardReserva(r){
  return `<button class="card clickable" data-act="ver" data-id="${r.id}">
    <div class="card-t"><div><span class="nr">${nr(r.num)}</span>${itensLi(r)}</div>${stamp(r)}</div>
    <dl class="meta"><dt>Retirada</dt><dd>${fmt(r.retirada)}</dd><dt>Devolução</dt><dd>${fmt(r.devolucao)}</dd><dt>Finalidade</dt><dd>${esc(r.finalidade)}</dd></dl>
  </button>`;
}
function vMinhas(list){
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
    <div class="stack" style="margin-top:1rem">${botaoAvisos()}${bioOk?(bioLocal(u.id)&&(u.passkeys||[]).some(k=>k.id===bioLocal(u.id))?'<p class="small muted">Assinatura por digital/Face ID: ativada neste celular.</p>':'<button class="btn btn-block" data-act="ativarBio">Ativar assinatura por digital/Face ID neste celular</button>'):''}<button class="btn btn-block" data-act="senha">Trocar minha senha</button><button class="btn btn-block" data-act="sair">Sair</button></div>`;
}
function abrirSolicitacao(){
  const itens=Object.entries(ui.cart).filter(([,q])=>q>0);
  const a=new Date(Date.now()+2*3600e3);a.setMinutes(0,0,0);
  const b=new Date(a.getTime()+24*3600e3);
  openModal('Nova solicitação',`<form id="f-sol" class="stack">
    <div class="ficha"><ul class="itens">${itens.map(([id,q])=>`<li><b>${q}×</b><span>${esc(tipo(id).nome)}</span></li>`).join('')}</ul></div>
    <div class="grid2">
      <label class="f"><span>Retirada</span><input class="i" type="datetime-local" name="ret" value="${toLocalInput(a)}" required></label>
      <label class="f"><span>Devolução prevista</span><input class="i" type="datetime-local" name="dev" value="${toLocalInput(b)}" required></label>
    </div>
    <label class="f"><span>Finalidade</span><select class="i" name="fin">${['Instrução','Serviço','Policiamento / operação','Formatura / solenidade','Outra'].map(x=>`<option>${x}</option>`).join('')}</select></label>
    <label class="f"><span>Observação (opcional)</span><textarea class="i" name="obs" placeholder="Ex.: instrução de tiro, turma B"></textarea></label>
    <p class="erro" id="sol-erro"></p>
    <button class="btn btn-pri btn-block">Enviar solicitação</button></form>`,'',
    'O Furriel recebe o pedido e avisa quando o material estiver separado.');
}
async function enviarSolicitacao(fd){
  const ret=new Date(fd.get('ret')), dev=new Date(fd.get('dev'));
  if(!(dev>ret)){$('#sol-erro').textContent='A devolução precisa ser depois da retirada.';return;}
  const itens=Object.entries(ui.cart).filter(([,q])=>q>0).map(([tipoId,qtd])=>({tipoId,qtd}));
  for(const i of itens){const c=contagem(i.tipoId);if(i.qtd>c.livre){$('#sol-erro').textContent=`Restam só ${c.livre} de ${tipo(i.tipoId).nome}. Ajuste a quantidade.`;return;}}
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
  const passos=[['Solicitada','Solicitada'],['Aprovada','Aprovada pelo Furriel'],['Separada','Material separado'],['Assinada','Retirada assinada pelo militar'],['Cautelada','Entrega confirmada pelo Furriel'],['Devolvida','Devolvido']];
  const log=r.log||[];const find=a=>log.find(l=>l.a===a);
  const fim=log.find(l=>l.a==='Recusada'||l.a==='Cancelada');
  let tl='<ol class="tl">';
  for(const [a,label] of passos){
    const l=find(a);
    if(!l&&fim){tl+=`<li class="bad"><b>${fim.a}</b><span>${fmt(fim.t)} · ${esc(nomeM(fim.por))}${fim.obs?' – '+esc(fim.obs):''}</span></li>`;break;}
    tl+=`<li class="${l?'done':''}"><b>${label}</b><span>${l?fmt(l.t)+' · '+esc(nomeM(l.por))+(l.obs?' – '+esc(l.obs):''):'—'}</span></li>`;
  }
  tl+='</ol>';
  const us=r.unidades||[];
  const pats=us.length?`<p class="small muted" style="margin-top:.7rem">Patrimônios</p><div class="row" style="margin-top:.25rem">${us.map(id=>{const x=unid(id);const cd=r.cond&&r.cond[id];
    return `<span class="tag mono">${esc(x?x.pat:id)}${cd&&cd!=='ok'?` – ${cd==='avaria'?'avaria':'extraviado'}`:''}</span>`;}).join('')}</div>`:'';
  const body=`<div class="ficha">${stamp(r,true)}
    <p class="nr">${nr(r.num)}</p><p style="font-weight:600;margin-top:.1rem">${esc(nomeM(r.userId))}</p><p class="small muted">${esc(user(r.userId).pelotao||'')}</p>
    ${itensLi(r)}
    <dl class="meta"><dt>Retirada</dt><dd>${fmt(r.retirada)}</dd><dt>Devolução</dt><dd class="${atrasada(r)?'c-stamp':''}">${fmt(r.devolucao)}</dd><dt>Finalidade</dt><dd>${esc(r.finalidade)}</dd>${r.obs?`<dt>Obs.</dt><dd>${esc(r.obs)}</dd>`:''}</dl>
    ${pats}</div>
    <h3 style="margin-top:1.1rem">Andamento</h3>${tl}`;
  let foot='';
  if(!admin&&['pendente','aprovada'].includes(r.status))foot=`<button class="btn btn-warn" data-act="cancelar" data-id="${r.id}">Cancelar solicitação</button>`;
  if(!admin&&r.status==='separada'&&!r.assinatura)foot=`<p class="small muted" style="margin-right:auto">Assine quando estiver na Furrielação, com o material na sua frente.</p><button class="btn btn-pri" data-act="assinar" data-id="${r.id}">Assinar retirada</button>`;
  if(!admin&&assinada(r))foot=`<p class="small muted" style="margin-right:auto">Assinado. Aguarde o Furriel confirmar a entrega.</p>`;
  if(admin)foot=acoesAdmin(r,true);
  openModal('Solicitação '+nr(r.num),body,foot);
}
async function cancelar(id){
  const r=R(id); if(!r||!['pendente','aprovada'].includes(r.status))return;
  if(!confirm('Cancelar esta solicitação?'))return;
  await updateDoc(doc(db,'reservas',id),{status:'cancelada',log:[...r.log,entrada('Cancelada','Pelo solicitante')]});
  closeModal();toast(`Solicitação ${nr(r.num)} cancelada.`);
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
      <button class="nav-b" data-act="senha">Trocar senha</button>
      <button class="nav-b" data-act="sair">Sair</button></div>
  </nav><main class="a-main">${views[v]()}</main></div>`;
}
function acoesAdmin(r,inModal){
  const cls='btn'+(inModal?'':' btn-sm');
  if(r.status==='pendente')return `<button class="${cls} btn-warn" data-act="recusar" data-id="${r.id}">Recusar</button><button class="${cls} btn-pri" data-act="aprovar" data-id="${r.id}">Aprovar</button>`;
  if(r.status==='aprovada')return `<button class="${cls} btn-pri" data-act="separar" data-id="${r.id}">Separar material</button>`;
  if(r.status==='separada')return r.assinatura?`<button class="${cls} btn-pri" data-act="confirmarEntrega" data-id="${r.id}">Confirmar entrega</button>`
    :`<button class="${cls}" data-act="cautelar" data-id="${r.id}">Assinar no balcão</button>`;
  if(r.status==='cautelada')return `<button class="${cls} btn-pri" data-act="devolver" data-id="${r.id}">Registrar devolução</button>`;
  return inModal?`<button class="btn" data-act="fechar">Fechar</button>`:'';
}
function cardAdmin(r){
  return `<div class="card">
    <button class="clickable" style="background:none;border:0;padding:0" data-act="ver" data-id="${r.id}">
      <div class="card-t"><div><span class="nr">${nr(r.num)}</span><p style="font-weight:600">${esc(nomeM(r.userId))}</p></div>${stamp(r)}</div>
      ${itensLi(r)}
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
  ${l.map(r=>`<tr class="hov" data-act="ver" data-id="${r.id}"><td class="mono">${nr(r.num)}</td><td>${esc(nomeM(r.userId))}</td><td>${esc(itensTxt(r))}</td>
  <td class="mono">${(r.unidades||[]).map(id=>esc(unid(id)?.pat||'')).join(', ')}</td><td class="${atrasada(r)?'c-stamp':''}">${fmt(r.devolucao)}</td><td>${stamp(r)}</td>
  <td><button class="btn btn-sm btn-pri" data-act="devolver" data-id="${r.id}">Registrar devolução</button></td></tr>`).join('')}</tbody></table></div>`
  :'<div class="empty">Todo o material está na Furrielação.</div>'}`;
}
const CATS=['Armas de fogo','Armas brancas e cerimonial','Comunicação','Proteção individual','Contenção e ordem pública','Iluminação','Uniforme e intempérie','Outros'];
const normTxt=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const catOf=t=>t.categoria||adivinhaCat(t.nome);
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
    uniformeintemperie:'Uniforme e intempérie',armamento:'Armas de fogo',armasdefogo:'Armas de fogo',armabranca:'Armas brancas e cerimonial',comunicacao:'Comunicação',iluminacao:'Iluminação',outros:'Outros'};
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
    <div class="row"><button class="btn" data-act="importar">Importar planilha</button><button class="btn btn-pri" data-act="novoTipo">Cadastrar material</button></div></div>
  ${cats.map(c=>{const l=ordTipos(D.tipos.filter(t=>catOf(t)===c));return `<h2 class="cat-h">${esc(c)}<span class="muted small">${l.length} ${l.length>1?'tipos':'tipo'}</span></h2>${l.map(bloco).join('')}`;}).join('')
    ||'<div class="empty"><p>Nenhum material cadastrado.</p><p style="margin-top:.6rem">Importe a planilha da Furrielação ou cadastre um a um.</p></div>'}`;
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
    (!q||(nomeM(r.userId)+' '+itensTxt(r)+' '+nr(r.num)+' '+(r.unidades||[]).map(id=>unid(id)?.pat).join(' ')).toLowerCase().includes(q)))
    .sort((a,b)=>b.num-a.num);
}
function vHist(){
  return `<div class="a-head"><div><h1>Histórico</h1><p>Todas as solicitações e cautelas registradas.</p></div><button class="btn" data-act="csv">Baixar planilha (CSV)</button></div>
  <div class="filters"><input class="i" type="search" placeholder="Buscar militar, material ou patrimônio" value="${esc(ui.q)}" data-inp="q" aria-label="Buscar">
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
  let body=`<form id="f-sep" data-id="${r.id}"><p class="muted small">Marque os patrimônios que vão ser entregues. Já deixamos os primeiros disponíveis marcados.</p>`;
  for(const i of r.itens){
    const disp=D.unidades.filter(u=>u.tipoId===i.tipoId&&u.status==='disponivel');
    body+=`<h3 style="margin-top:.9rem">${esc(tipo(i.tipoId).nome)} <span class="muted small">– selecione ${i.qtd}</span></h3>
    <div class="pick" data-tipo="${i.tipoId}" data-q="${i.qtd}">${disp.map((u,k)=>`<label><input type="checkbox" name="u" value="${u.id}" ${k<i.qtd?'checked':''}><span class="mono">${esc(u.pat)}${u.serie?`<br><span class="small muted">${esc(u.serie)}</span>`:''}</span></label>`).join('')||'<p class="c-stamp small">Nenhuma unidade disponível.</p>'}</div>`;
  }
  body+=`<p class="erro" id="sep-erro"></p><button class="btn btn-pri btn-block">Confirmar separação</button></form>`;
  openModal('Separar material – '+nr(r.num),body,'',esc(nomeM(r.userId))+' · retirada '+fmt(r.retirada));
}
async function confirmarSeparacao(form){
  const r=R(form.dataset.id);const sel=[];
  for(const g of form.querySelectorAll('.pick')){
    const ch=[...g.querySelectorAll('input:checked')].map(x=>x.value);
    if(ch.length!==+g.dataset.q){$('#sep-erro').textContent=`Em ${tipo(g.dataset.tipo).nome}, marque exatamente ${g.dataset.q}.`;return;}
    sel.push(...ch);
  }
  try{
    await runTransaction(db,async tx=>{
      const snaps=await Promise.all(sel.map(id=>tx.get(doc(db,'unidades',id))));
      if(snaps.some(s=>!s.exists()||s.data().status!=='disponivel'))throw {code:'mudou'};
      sel.forEach(id=>tx.update(doc(db,'unidades',id),{status:'separado'}));
      tx.update(doc(db,'reservas',r.id),{status:'separada',unidades:sel,log:[...r.log,entrada('Separada')]});
    });
  }catch(e){if(e&&e.code==='mudou'){$('#sep-erro').textContent='Uma das unidades acabou de mudar de situação. Feche e abra de novo.';return;}throw e;}
  closeModal();toast(`${nr(r.num)} separada. O militar já vê que o material está pronto.`);
}
function cautelar(id){
  const r=R(id);if(!r)return;
  openModal('Assinar no balcão – '+nr(r.num),`<form id="f-caut" data-id="${r.id}" class="stack" autocomplete="off">
    <div class="ficha"><p style="font-weight:600">${esc(nomeM(r.userId))}</p><p class="small muted">${esc(user(r.userId).pelotao)}</p>
      <ul class="itens">${r.unidades.map(uid=>{const u=unid(uid)||{pat:'?'};return `<li><span class="mono">${esc(u.pat)}</span><span>${esc(tipo(u.tipoId).nome)}${u.serie?` <span class="small muted">(série ${esc(u.serie)})</span>`:''}</span></li>`;}).join('')}</ul>
      <dl class="meta"><dt>Devolver até</dt><dd>${fmt(r.devolucao)}</dd></dl></div>
    <p class="small">Use só se o militar estiver sem celular. Ele confere o material na sua frente e digita a própria senha aqui. Isso vale como assinatura dele e como sua confirmação da entrega.</p>
    <label class="f"><span>Senha de ${esc(nomeM(r.userId))}</span><input class="i" type="password" name="s" required autocomplete="new-password"></label>
    <p class="erro" id="caut-erro"></p>
    <button class="btn btn-pri btn-block">Assinar e entregar material</button></form>`);
}
function textoAssinatura(r,em){
  const us=(r.unidades||[]).map(id=>{const u=unid(id)||{pat:id};return u.pat+(u.serie?'/'+u.serie:'');}).join(', ');
  return `SICAM | Cautela ${nr(r.num)} | ${nomeM(r.userId)} | Material: ${us} | Devolução até ${fmt(r.devolucao)} | Assinado em ${em}`;
}
function assinar(id){
  const r=R(id);if(!r||r.status!=='separada'||r.assinatura)return;
  const u=me();const temBio=bioOk&&bioLocal(u.id)&&(u.passkeys||[]).some(k=>k.id===bioLocal(u.id));
  openModal('Assinar retirada – '+nr(r.num),`<div class="stack">
    <div class="ficha"><p style="font-weight:600">${esc(nomeM(r.userId))}</p>
      <ul class="itens">${r.unidades.map(uid=>{const x=unid(uid)||{pat:'?'};return `<li><span class="mono">${esc(x.pat)}</span><span>${esc(tipo(x.tipoId).nome)}${x.serie?` <span class="small muted">(série ${esc(x.serie)})</span>`:''}</span></li>`;}).join('')}</ul>
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
  toast('Assinatura por digital/Face ID ativada neste celular.');render();
}
function confirmarEntrega(id){
  const r=R(id);if(!r||!r.assinatura)return;const a=r.assinatura;
  openModal('Confirmar entrega – '+nr(r.num),`<form id="f-entrega" data-id="${r.id}" class="stack">
    <div class="ficha">${stamp(r)}<p style="font-weight:600">${esc(nomeM(r.userId))}</p><p class="small muted">${esc(user(r.userId).pelotao)}</p>
      <ul class="itens">${r.unidades.map(uid=>{const x=unid(uid)||{pat:'?'};return `<li><span class="mono">${esc(x.pat)}</span><span>${esc(tipo(x.tipoId).nome)}${x.serie?` <span class="small muted">(série ${esc(x.serie)})</span>`:''}</span></li>`;}).join('')}</ul>
      <dl class="meta"><dt>Assinado</dt><dd>${fmt(a.em)}, ${esc(METODO[a.metodo]||a.metodo)}</dd><dt>Devolver até</dt><dd>${fmt(r.devolucao)}</dd></dl></div>
    <label class="check"><input type="checkbox" name="ok" required><span>Conferi a identidade do militar e entreguei o material listado.</span></label>
    <button class="btn btn-pri btn-block">Confirmar entrega</button></form>`);
}
async function efetivarEntrega(form){
  const r=R(form.dataset.id);if(!r||!r.assinatura||r.status!=='separada')return;
  const b=writeBatch(db);const em=nowISO();
  r.unidades.forEach(id=>b.update(doc(db,'unidades',id),{status:'cautelado'}));
  b.update(doc(db,'reservas',r.id),{status:'cautelada',anuencia:{por:sess.userId,em},log:[...r.log,entrada('Cautelada','Entrega confirmada pelo Furriel')]});
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
function devolver(id){
  const r=R(id);if(!r)return;
  openModal('Registrar devolução – '+nr(r.num),`<form id="f-dev" data-id="${r.id}" class="stack">
    <p>${esc(nomeM(r.userId))}${atrasada(r)?` <span class="stamp c-stamp">Em atraso</span>`:''}</p>
    <div class="ficha">${r.unidades.map(uid=>{const u=unid(uid)||{pat:'?',id:uid};return `<div class="dev-row"><div><span class="mono">${esc(u.pat)}</span> <span class="small muted">${esc(tipo(u.tipoId).nome)}</span></div>
      <select class="i" name="c_${uid}" style="width:auto"><option value="ok">Em condições</option><option value="avaria">Com avaria</option><option value="extraviado">Extraviado</option></select></div>`;}).join('')}</div>
    <label class="f"><span>Observação (opcional)</span><textarea class="i" name="obs" placeholder="Ex.: HT-002 devolvido sem bateria"></textarea></label>
    <p class="small muted">Material com avaria vai para manutenção e sai da lista de disponíveis.</p>
    <button class="btn btn-pri btn-block">Confirmar devolução</button></form>`);
}
async function confirmarDevolucao(form,fd){
  const r=R(form.dataset.id);const cond={};let prob=0;const b=writeBatch(db);
  r.unidades.forEach(id=>{const c=fd.get('c_'+id)||'ok';cond[id]=c;if(c!=='ok')prob++;
    b.update(doc(db,'unidades',id),{status:c==='ok'?'disponivel':c==='avaria'?'manutencao':'extraviado'});});
  const obs=String(fd.get('obs')||'').trim()||(prob?`${prob} item(ns) com alteração`:'Todos em condições');
  b.update(doc(db,'reservas',r.id),{status:'devolvida',cond,log:[...r.log,entrada('Devolvida',obs)]});
  await b.commit();closeModal();toast(`Devolução de ${nr(r.num)} registrada.`,prob>0);
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
  const t=tipo(id);const usado=D.reservas.some(r=>(r.itens||[]).some(i=>i.tipoId===id));
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
    if(m.lote!=null||/muni/i.test(nomeAba)){avisos.push(`Aba "${nomeAba}": munição ainda não é controlada pelo app. Aba ignorada.`);continue;}
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

/* ============ Exportar CSV ============ */
function exportarCSV(){
  const q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
  const when=(r,a)=>{const l=(r.log||[]).find(x=>x.a===a);return l?fmt(l.t):'';};
  const rows=[['Nº','Militar','Pelotão','Material','Patrimônios','Finalidade','Retirada prevista','Devolução prevista','Situação','Solicitada','Assinada','Forma de assinatura','Entrega confirmada','Devolvida','Observação']]
    .concat([...D.reservas].sort((a,b)=>a.num-b.num).map(r=>[nr(r.num),nomeM(r.userId),user(r.userId).pelotao,itensTxt(r),(r.unidades||[]).map(id=>unid(id)?.pat).join(' '),r.finalidade,fmt(r.retirada),fmt(r.devolucao),
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
  esqueci:()=>openModal('Esqueci minha senha',`<form id="f-esq" class="stack"><label class="f"><span>E-mail institucional</span><input class="i" name="email" type="email" required autocapitalize="off"></label>
    <p class="erro" id="esq-erro"></p><button class="btn btn-pri btn-block">Enviar link para nova senha</button></form>`),
  jaConfirmei:async()=>{const u=auth.currentUser;if(!u)return;await u.reload();if(auth.currentUser.emailVerified){await auth.currentUser.getIdToken(true);await aoMudarLogin(auth.currentUser);}else $('#ver-erro').textContent='Ainda não consta a confirmação. Clique no link do e-mail e tente de novo.';},
  reenviar:async()=>{try{await sendEmailVerification(auth.currentUser);toast('E-mail reenviado.');}catch(e){toast(e.code==='auth/too-many-requests'?'Aguarde alguns minutos antes de reenviar.':erroFirebase(e),true);}},
  liberar:async el=>{await updateDoc(doc(db,'users',el.dataset.id),{ativo:true,pendente:false,liberadoPor:sess.userId,liberadoEm:nowISO()});toast('Acesso liberado.');},
  recusarUser:async el=>{if(!confirm('Recusar este cadastro? O militar não conseguirá entrar.'))return;await updateDoc(doc(db,'users',el.dataset.id),{ativo:false,pendente:false});toast('Cadastro recusado.');},
  avisos:async()=>{try{await Notification.requestPermission();}catch(e){}render();},
  cart:el=>{const id=el.dataset.id,c=contagem(id);ui.cart[id]=Math.max(0,Math.min(c.livre,(ui.cart[id]||0)+(+el.dataset.d)));render();},
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
  csv:exportarCSV
};
document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-act]');if(!el)return;
  const f=acts[el.dataset.act];if(!f)return;
  e.preventDefault();
  try{await f(el);}catch(err){console.error(err);toast(erroFirebase(err),true);}
});
document.addEventListener('toggle',e=>{if(e.target.matches&&e.target.matches('details.tipo')&&e.target.open)ui.aberto=e.target.dataset.tipo;},true);

const forms={
  'f-login':async fd=>{loginMsg='';
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
  'f-caut':(fd,f)=>confirmarCautela(f,fd),
  'f-assinar':(fd,f)=>assinarSenha(f,fd),
  'f-entrega':(fd,f)=>efetivarEntrega(f),
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
});
document.addEventListener('input',e=>{if(e.target.dataset&&e.target.dataset.inp==='busca'){ui.busca=e.target.value;render();return;}
  if(e.target.dataset&&e.target.dataset.inp==='q'){ui.q=e.target.value;$('#hist-t').innerHTML=tabHist(histFiltrado());}});

/* ============ Firebase: sessão e dados ao vivo ============ */
function pararEscutas(){unsubs.forEach(u=>{try{u();}catch(e){}});unsubs=[];loaded={};}
function escutarTudo(){
  const cols=['users','tipos','unidades','reservas'];
  cols.forEach(nome=>{
    const un=onSnapshot(collection(db,nome),snap=>{
      const primeira=!loaded[nome];
      if(nome==='users'&&!primeira){const eu=me();if(eu&&eu.perfil==='furriel')snap.docChanges().forEach(ch=>{const u=ch.doc.data();if(u.pendente&&(ch.type==='added'||(ch.type==='modified'&&!(D.users.find(x=>x.id===ch.doc.id)||{}).pendente)))avisar('Novo cadastro para liberar',`${u.grad||''} ${u.nome} – ${u.pelotao||''}`);});}
      if(nome==='reservas'&&!primeira){
        const eu=me();
        snap.docChanges().forEach(ch=>{
          const r={id:ch.doc.id,...ch.doc.data()};
          if(eu&&eu.perfil==='furriel'&&ch.type==='added'&&r.status==='pendente'&&r.userId!==eu.id)
            avisar(`Nova solicitação ${nr(r.num)}`,`${nomeM(r.userId)}: ${itensTxt(r)}`);
          if(eu&&eu.perfil==='furriel'&&ch.type==='modified'&&r.status==='separada'&&r.assinatura&&!(D.reservas.find(x=>x.id===r.id)||{}).assinatura)
            avisar(`${nr(r.num)} assinada`,`${nomeM(r.userId)} assinou a retirada. Confira e confirme a entrega.`);
          if(eu&&eu.perfil!=='furriel'&&ch.type==='modified'&&r.userId===eu.id){
            const old=D.reservas.find(x=>x.id===r.id);
            if(old&&old.status!==r.status&&r.status!=='cancelada')avisar(`Solicitação ${nr(r.num)}`,(ST[r.status]||[r.status])[0]);
          }
        });
      }
      let arr=snap.docs.map(d=>({id:d.id,...d.data()}));
      if(nome==='tipos')arr.sort((a,b)=>(a.ordem??99)-(b.ordem??99)||a.nome.localeCompare(b.nome));
      if(nome==='unidades')arr.sort((a,b)=>a.pat.localeCompare(b.pat,'pt-BR',{numeric:true}));
      if(nome==='reservas')arr.forEach(r=>{r.log=r.log||[];r.unidades=r.unidades||[];r.itens=r.itens||[];});
      D[nome]=arr;loaded[nome]=true;
      if(nome==='users'){const eu=me();if(eu&&!eu.ativo){loginMsg='Seu acesso foi desativado. Procure a Furrielação.';signOut(auth);return;}}
      if(cols.every(c=>loaded[c])){fase='app';render();}
    },err=>{console.error(err);if(err.code==='permission-denied'){loginMsg='Sem permissão de acesso. Procure a Furrielação.';signOut(auth);}else toast(erroFirebase(err),true);});
    unsubs.push(un);
  });
}
async function setupFeito(){const s=await getDoc(doc(db,'config','setup'));return s.exists();}
async function aoMudarLogin(u){
  if(bootstrapping)return;
  pararEscutas();closeModal();if(aguardandoUnsub){aguardandoUnsub();aguardandoUnsub=null;}
  try{
    if(!u){sess=null;D={users:[],tipos:[],unidades:[],reservas:[]};const f=(await setupFeito())?'login':'setup';fase=(fase==='cadastro'&&f==='login')?'cadastro':f;document.title='SICAM';render();return;}
    if(!ehLegado(u.email)&&!u.emailVerified){fase='verificar';render();return;}
    fase='carregando';render();
    const s=await getDoc(doc(db,'users',u.uid));
    if(!s.exists()){loginMsg='Conta sem cadastro no sistema. Crie sua conta de novo ou procure a Furrielação.';await signOut(auth);return;}
    if(s.data().pendente){fase='aguardando';render();
      aguardandoUnsub=onSnapshot(doc(db,'users',u.uid),d=>{const x=d.data();if(x&&x.ativo){aguardandoUnsub&&aguardandoUnsub();aguardandoUnsub=null;aoMudarLogin(auth.currentUser);}
        else if(x&&!x.pendente&&!x.ativo){loginMsg='Seu cadastro não foi liberado. Procure a Furrielação.';signOut(auth);}},()=>{});
      return;}
    if(!s.data().ativo){loginMsg='Seu acesso foi desativado. Procure a Furrielação.';await signOut(auth);return;}
    sess={userId:u.uid};ui.view=null;escutarTudo();
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
  else if(fase==='verificar')html=vVerificar();
  else if(fase==='aguardando')html=vAguardando();
  else if(fase==='login'||!sess||!me())html=fase==='app'?vCarregando():vLogin();
  else html=me().perfil==='furriel'?vAdmin():vApp();
  $('#app').innerHTML=html;
  if(keep){const el=document.querySelector(`[data-inp="${keep}"]`);if(el){el.focus();try{el.setSelectionRange(pos,pos);}catch(e){}}}
}

render();
if(configurado){
  try{
    app=initializeApp(SICAM_FIREBASE);auth=getAuth(app);try{auth.useDeviceLanguage();}catch(e){}db=getFirestore(app);
    onAuthStateChanged(auth,aoMudarLogin);
  }catch(e){erroMsg=erroFirebase(e);fase='erro';render();}
}
setInterval(()=>{if(fase==='app'&&!modal.open&&!(document.activeElement&&document.activeElement.matches('input,select,textarea')))render();},60000);
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
