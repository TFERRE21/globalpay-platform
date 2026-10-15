const $=s=>document.querySelector(s);
const authCard=$("#auth-card"),dashboard=$("#dashboard"),registerForm=$("#register-form"),loginForm=$("#login-form"),notice=$("#auth-notice");
function showNotice(el,msg){el.hidden=false;el.textContent=msg;}
function setTab(which){const isRegister=which==="register";registerForm.hidden=!isRegister;loginForm.hidden=isRegister;$("#tab-register").classList.toggle("active",isRegister);$("#tab-login").classList.toggle("active",!isRegister);$("#account-heading").textContent=isRegister?"Crie sua conta CrediViva":"Entre na sua conta";notice.hidden=true;}
$("#tab-register").addEventListener("click",()=>setTab("register"));$("#tab-login").addEventListener("click",()=>setTab("login"));
const token=()=>localStorage.getItem("crediviva-token");
async function api(url,options={}){const headers={"Content-Type":"application/json",...(options.headers||{})};if(token())headers.Authorization="Bearer "+token();const r=await fetch(url,{...options,headers});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.message||"Não foi possível concluir a operação.");return data;}
registerForm.addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(registerForm);try{const data=await api("/api/auth/register",{method:"POST",body:JSON.stringify({name:f.get("name"),email:f.get("email"),phone:f.get("phone"),password:f.get("password"),whatsappOptIn:f.get("whatsappOptIn")==="on"})});localStorage.setItem("crediviva-token",data.token);showNotice(notice,"Cadastro realizado! Carregando sua área do cliente.");await loadDashboard();}catch(err){showNotice(notice,err.message);}});
loginForm.addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(loginForm);try{const data=await api("/api/auth/login",{method:"POST",body:JSON.stringify({email:f.get("email"),password:f.get("password")})});localStorage.setItem("crediviva-token",data.token);await loadDashboard();}catch(err){showNotice(notice,err.message);}});
async function loadLoans(){const list=$("#loan-list");list.replaceChildren();try{const data=await api("/api/loans");if(!data.applications.length){const p=document.createElement("p");p.textContent="Você ainda não possui solicitações. Volte à página inicial e escolha uma modalidade para iniciar.";p.style.color="#5b7189";list.append(p);return;}for(const loan of data.applications){const card=document.createElement("article");card.className="loan-item";const h=document.createElement("h3");h.textContent=loan.product;const status=document.createElement("span");status.className="loan-status";status.textContent=String(loan.status).replaceAll("_"," ");const p=document.createElement("p");p.textContent="Protocolo: "+loan.protocol+" · Valor: "+loan.amount_range+" · Prazo: "+loan.urgency;const note=document.createElement("p");note.textContent=loan.status_note||"Não há observações adicionais.";const date=document.createElement("p");date.textContent="Atualizado em: "+new Date(loan.updated_at).toLocaleString("pt-BR");card.append(h,status,p,note,date);list.append(card);}}catch(err){const p=document.createElement("p");p.textContent=err.message;list.append(p);}}
async function loadDashboard(){try{const data=await api("/api/auth/me");authCard.hidden=true;dashboard.classList.add("show");$("#welcome").textContent="Olá, "+data.user.name.split(" ")[0]+"!";const form=$("#phone-form");form.elements.phone.value=data.user.phone||"";form.elements.whatsappOptIn.checked=data.user.whatsapp_opt_in===true;await loadLoans();const pending=localStorage.getItem("crediviva-pending-loan");if(pending){localStorage.removeItem("crediviva-pending-loan");const loan=JSON.parse(pending);const made=await api("/api/loans",{method:"POST",body:JSON.stringify({product:({veiculo:"Empréstimo com garantia de veículo",cartao:"Crédito pelo cartão",pessoal:"Empréstimo pessoal / CLT",imovel:"Crédito com garantia de imóvel"})[loan.product]||loan.product,amount:loan.amount,urgency:loan.urgency})});showNotice($("#phone-notice"),"Solicitação registrada com protocolo "+made.application.protocol+". Ela ainda não foi enviada a um banco.");await loadLoans();}}catch(err){localStorage.removeItem("crediviva-token");authCard.hidden=false;dashboard.classList.remove("show");}}
$("#phone-form").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{const data=await api("/api/auth/phone",{method:"PUT",body:JSON.stringify({phone:f.get("phone"),whatsappOptIn:f.get("whatsappOptIn")==="on"})});showNotice($("#phone-notice"),data.message);}catch(err){showNotice($("#phone-notice"),err.message);}});
$("#refresh-loans").addEventListener("click",loadLoans);$("#logout").addEventListener("click",()=>{localStorage.removeItem("crediviva-token");location.reload();});
if(new URLSearchParams(location.search).get("cadastro")==="1")setTab("register");else setTab("login");
if(token())loadDashboard();

async function registerPush(){
 const notice=$("#push-notice");
 const show=(message)=>{notice.hidden=false;notice.textContent=message;};
 try{
  if(!("serviceWorker" in navigator)||!("PushManager" in window)||!("Notification" in window)){show("Este navegador não oferece notificações push. Tente pelo Chrome no celular.");return;}
  if(!token()){show("Entre na sua conta primeiro.");return;}
  const keyResponse=await fetch("/api/notifications/vapid-public-key");
  const keyData=await keyResponse.json();
  if(!keyResponse.ok)throw new Error(keyData.message||"Notificações ainda não configuradas no servidor.");
  const permission=await Notification.requestPermission();
  if(permission!=="granted"){show("Permissão de notificações não concedida. Ative nas configurações do navegador e tente novamente.");return;}
  const registration=await navigator.serviceWorker.register("/sw.js");
  let subscription=await registration.pushManager.getSubscription();
  if(!subscription){
   const raw=keyData.publicKey.replace(/-/g,"+").replace(/_/g,"/");
   const padded=raw+"=".repeat((4-raw.length%4)%4);
   const bytes=Uint8Array.from(atob(padded),c=>c.charCodeAt(0));
   subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
  }
  const response=await api("/api/notifications/subscribe",{method:"POST",body:JSON.stringify({subscription})});
  show(response.message||"Notificações ativadas neste celular.");
 }catch(error){show(error.message||"Não foi possível ativar as notificações.");}
}
$("#enable-push")?.addEventListener("click",registerPush);
$("#test-push")?.addEventListener("click",async()=>{const notice=$("#push-notice");notice.hidden=false;notice.textContent="Enviando teste...";try{const data=await api("/api/notifications/test",{method:"POST",body:"{}"});notice.textContent=data.message;}catch(error){notice.textContent=error.message;}});

const forgotButton=$("#forgot-password"),forgotForm=$("#forgot-form"),resetForm=$("#reset-form"),backToLogin=$("#back-to-login"),changePasswordForm=$("#change-password-form");
function hideAuthForms(){[registerForm,loginForm,forgotForm,resetForm].forEach(f=>{if(f)f.hidden=true;});}
forgotButton?.addEventListener("click",()=>{hideAuthForms();forgotForm.hidden=false;notice.hidden=true;});
backToLogin?.addEventListener("click",()=>setTab("login"));
forgotForm?.addEventListener("submit",async e=>{e.preventDefault();const email=new FormData(forgotForm).get("email");try{const data=await api("/api/auth/forgot-password",{method:"POST",body:JSON.stringify({email})});showNotice(notice,data.message);forgotForm.reset();}catch(err){showNotice(notice,err.message);}});
const resetToken=new URLSearchParams(location.search).get("reset");
if(resetToken){hideAuthForms();if(resetForm){resetForm.hidden=false;notice.hidden=false;notice.textContent="Crie sua nova senha. O link de recuperação expira em 30 minutos.";}}
resetForm?.addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(resetForm),password=f.get("password"),confirm=f.get("confirmPassword");if(password!==confirm){showNotice(notice,"As senhas não são iguais.");return;}try{const data=await api("/api/auth/reset-password",{method:"POST",body:JSON.stringify({token:resetToken,password})});showNotice(notice,data.message);resetForm.hidden=true;history.replaceState({},"",location.pathname);setTab("login");}catch(err){showNotice(notice,err.message);}});
changePasswordForm?.addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(changePasswordForm),currentPassword=f.get("currentPassword"),newPassword=f.get("newPassword");try{const data=await api("/api/auth/change-password",{method:"POST",body:JSON.stringify({currentPassword,newPassword})});showNotice($("#password-notice"),data.message);changePasswordForm.reset();}catch(err){showNotice($("#password-notice"),err.message);}});

const forgotBtn=document.querySelector("#forgot-password");
const forgotForm=document.querySelector("#forgot-form");
const resetForm=document.querySelector("#reset-form");
const backBtn=document.querySelector("#back-to-login");
const changeForm=document.querySelector("#change-password-form");
function hideAccountForms(){[registerForm,loginForm,forgotForm,resetForm].forEach(form=>{if(form)form.hidden=true;});}
forgotBtn?.addEventListener("click",()=>{hideAccountForms();forgotForm.hidden=false;notice.hidden=true;});
backBtn?.addEventListener("click",()=>setTab("login"));
forgotForm?.addEventListener("submit",async event=>{event.preventDefault();const email=new FormData(forgotForm).get("email");try{const result=await api("/api/auth/forgot-password",{method:"POST",body:JSON.stringify({email})});showNotice(notice,result.message);forgotForm.reset();}catch(error){showNotice(notice,error.message);}});
const recoveryToken=new URLSearchParams(location.search).get("reset");
if(recoveryToken){hideAccountForms();if(resetForm){resetForm.hidden=false;showNotice(notice,"Crie uma nova senha. O link expira em 30 minutos.");}}
resetForm?.addEventListener("submit",async event=>{event.preventDefault();const formData=new FormData(resetForm);const newPass=formData.get("password");if(newPass!==formData.get("confirmPassword")){showNotice(notice,"As senhas não são iguais.");return;}try{const result=await api("/api/auth/reset-password",{method:"POST",body:JSON.stringify({token:recoveryToken,password:newPass})});showNotice(notice,result.message);resetForm.hidden=true;history.replaceState({},"",location.pathname);setTab("login");}catch(error){showNotice(notice,error.message);}});
changeForm?.addEventListener("submit",async event=>{event.preventDefault();const formData=new FormData(changeForm);try{const result=await api("/api/auth/change-password",{method:"POST",body:JSON.stringify({currentPassword:formData.get("currentPassword"),newPassword:formData.get("newPassword")})});showNotice(document.querySelector("#password-notice"),result.message);changeForm.reset();}catch(error){showNotice(document.querySelector("#password-notice"),error.message);}});
