const $=s=>document.querySelector(s);
const authCard=$("#auth-card"),dashboard=$("#dashboard"),registerForm=$("#register-form"),loginForm=$("#login-form"),notice=$("#auth-notice");
function showNotice(el,msg){el.hidden=false;el.textContent=msg;}
function setTab(which){const isRegister=which==="register";registerForm.hidden=!isRegister;loginForm.hidden=isRegister;$("#tab-register").classList.toggle("active",isRegister);$("#tab-login").classList.toggle("active",!isRegister);$("#account-heading").textContent=isRegister?"Crie sua conta CrediViva":"Entre na sua conta";notice.hidden=true;}
$("#tab-register").addEventListener("click",()=>setTab("register"));$("#tab-login").addEventListener("click",()=>setTab("login"));
const token=()=>localStorage.getItem("crediviva-token");
async function api(url,options={}){const headers={"Content-Type":"application/json",...(options.headers||{})};if(token())headers.Authorization="Bearer "+token();const r=await fetch(url,{...options,headers});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.message||"Não foi possível concluir a operação.");return data;}
registerForm.addEventListener("submit",async e=>{
 e.preventDefault();
 const f=new FormData(registerForm),button=registerForm.querySelector('button[type="submit"]');
 const originalLabel=button?.textContent;
 if(button){button.disabled=true;button.textContent="Criando sua conta...";}
 try{
  const payload={name:String(f.get("name")||"").trim(),email:String(f.get("email")||"").trim().toLowerCase(),phone:String(f.get("phone")||"").trim(),password:String(f.get("password")||""),whatsappOptIn:f.get("whatsappOptIn")==="on"};
  const created=await api("/api/auth/register",{method:"POST",body:JSON.stringify(payload)});
  showNotice(notice,created.message||"Cadastro realizado. Validando acesso...");
  const session=await api("/api/auth/login",{method:"POST",body:JSON.stringify({email:payload.email,password:payload.password})});
  if(!session.token)throw new Error("Conta criada, mas não foi possível iniciar a sessão. Entre com seu e-mail e senha.");
  localStorage.setItem("crediviva-token",session.token);
  await loadDashboard();
 }catch(err){showNotice(notice,err.message||"Não foi possível criar sua conta. Tente novamente.");}
 finally{if(button){button.disabled=false;button.textContent=originalLabel||"Criar conta e acompanhar";}}
});
loginForm.addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(loginForm);try{const data=await api("/api/auth/login",{method:"POST",body:JSON.stringify({email:f.get("email"),password:f.get("password")})});localStorage.setItem("crediviva-token",data.token);await loadDashboard();}catch(err){showNotice(notice,err.message);}});
async function loadLoans(){const list=$("#loan-list");list.replaceChildren();try{const data=await api("/api/loans");if(!data.applications.length){const p=document.createElement("p");p.textContent="Você ainda não possui solicitações. Volte à página inicial e escolha uma modalidade para iniciar.";p.style.color="#5b7189";list.append(p);return;}for(const loan of data.applications){const card=document.createElement("article");card.className="loan-item";const h=document.createElement("h3");h.textContent=loan.product;const status=document.createElement("span");status.className="loan-status";status.textContent=String(loan.status).replaceAll("_"," ");const p=document.createElement("p");p.textContent="Protocolo: "+loan.protocol+" · Valor: "+loan.amount_range+" · Prazo: "+loan.urgency;const note=document.createElement("p");note.textContent=loan.status_note||"Não há observações adicionais.";const date=document.createElement("p");date.textContent="Atualizado em: "+new Date(loan.updated_at).toLocaleString("pt-BR");card.append(h,status,p,note,date);list.append(card);}}catch(err){const p=document.createElement("p");p.textContent=err.message;list.append(p);}}
async function loadDashboard(){try{const data=await api("/api/auth/me");authCard.hidden=true;dashboard.classList.add("show");$("#welcome").textContent="Olá, "+data.user.name.split(" ")[0]+"!";const form=$("#phone-form");form.elements.phone.value=data.user.phone||"";form.elements.whatsappOptIn.checked=data.user.whatsapp_opt_in===true;await loadLoans();await loadPix();const pending=localStorage.getItem("crediviva-pending-loan");if(pending){try{const loan=JSON.parse(pending);const made=await api("/api/loans",{method:"POST",body:JSON.stringify({product:({veiculo:"Empréstimo com garantia de veículo",cartao:"Crédito pelo cartão",pessoal:"Empréstimo pessoal / CLT",imovel:"Crédito com garantia de imóvel"})[loan.product]||loan.product,amount:loan.amount,urgency:loan.urgency})});localStorage.removeItem("crediviva-pending-loan");showNotice($("#phone-notice"),"Solicitação registrada com protocolo "+made.application.protocol+". Ela ainda não foi enviada a um banco.");await loadLoans();}catch(pendingError){showNotice($("#phone-notice"),pendingError.message||"Não foi possível registrar a solicitação.");}}}catch(err){if(err.message&&/sessão inválida|entre na sua conta|expirada/i.test(err.message)){localStorage.removeItem("crediviva-token");authCard.hidden=false;dashboard.classList.remove("show");showNotice(notice,"Sua sessão expirou. Entre novamente.");}else{showNotice(notice,err.message||"Não foi possível carregar sua conta. Tente novamente.");}}}
$("#phone-form").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{const data=await api("/api/auth/phone",{method:"PUT",body:JSON.stringify({phone:f.get("phone"),whatsappOptIn:f.get("whatsappOptIn")==="on"})});showNotice($("#phone-notice"),data.message);}catch(err){showNotice($("#phone-notice"),err.message);}});
const accountLoanForm=$("#account-loan-form");accountLoanForm?.addEventListener("submit",async event=>{event.preventDefault();const formData=new FormData(accountLoanForm),product=formData.get("product"),amount=formData.get("amount"),urgency=formData.get("urgency"),productNames={veiculo:"Empréstimo com garantia de veículo",cartao:"Crédito pelo cartão",pessoal:"Empréstimo pessoal / CLT",imovel:"Crédito com garantia de imóvel"},status=$("#account-loan-notice");try{const data=await api("/api/loans",{method:"POST",body:JSON.stringify({product:productNames[product]||product,amount,urgency})});showNotice(status,"Solicitação registrada com protocolo "+data.application.protocol+". Ela ainda não foi enviada a um banco ou parceiro financeiro.");accountLoanForm.reset();await loadLoans();}catch(error){showNotice(status,error.message||"Não foi possível registrar a solicitação.");}});
$("#refresh-loans").addEventListener("click",loadLoans);$("#logout").addEventListener("click",()=>{localStorage.removeItem("crediviva-token");location.reload();});
if(new URLSearchParams(location.search).get("cadastro")==="1")setTab("register");else setTab("login");
if(token()){loadDashboard();loadPix();}


const pixForm=$("#pix-form"),pixNotice=$("#pix-notice"),pixStatus=$("#pix-status"),pixSummary=$("#pix-summary");
function renderPix(data){
 const p=data?.pixKey;if(!p){pixStatus.textContent="Não cadastrada";pixSummary.hidden=true;return;}
 pixStatus.textContent=p.status==="VALIDADA"?"Validada":p.status==="AGUARDANDO_VALIDACAO"?"Aguardando validação":p.status==="NECESSITA_CORRECAO"?"Necessita correção":p.status==="ATUALIZACAO_PENDENTE"?"Atualização pendente":"Cadastrada";
 pixSummary.hidden=false;pixSummary.replaceChildren();
 const title=document.createElement("strong");title.textContent="Chave cadastrada: "+p.maskedKey;
 const detail=document.createElement("p");detail.textContent="Titular: "+p.holderName+" · Documento: "+p.maskedDocument+(p.institution?" · Instituição: "+p.institution:"");
 const note=document.createElement("p");note.textContent="Atualizada em "+new Date(p.updatedAt).toLocaleString("pt-BR")+". A titularidade não foi verificada.";
 pixSummary.append(title,detail,note);
 pixForm.elements.keyType.value=p.keyType;pixForm.elements.keyValue.value="";pixForm.elements.keyValue.placeholder="Informe nova chave para substituir";pixForm.elements.holderName.value=p.holderName;pixForm.elements.holderDocument.value="";pixForm.elements.holderDocument.placeholder="Documento salvo por segurança";pixForm.elements.institution.value=p.institution||"";
}
async function loadPix(){if(!pixForm)return;try{renderPix(await api("/api/pix-key"));}catch(error){showNotice(pixNotice,error.message||"Não foi possível carregar a chave Pix.");}}
pixForm?.elements.keyType.addEventListener("change",()=>{const hints={CPF:"Digite o CPF da chave",CNPJ:"Digite o CNPJ da chave",EMAIL:"nome@exemplo.com",PHONE:"+5561999999999",EVP:"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"};pixForm.elements.keyValue.placeholder=hints[pixForm.elements.keyType.value]||"Informe a chave Pix";});
pixForm?.addEventListener("submit",async e=>{
 e.preventDefault();if(!pixForm.reportValidity())return;
 const f=new FormData(pixForm),payload={keyType:f.get("keyType"),keyValue:String(f.get("keyValue")||"").trim(),holderName:String(f.get("holderName")||"").trim(),holderDocument:String(f.get("holderDocument")||"").trim(),institution:String(f.get("institution")||"").trim()};
 try{
  let result=await api("/api/pix-key",{method:"PUT",body:JSON.stringify(payload)});
  if(result.requiresConfirmation){if(!window.confirm(result.message+" Deseja substituir a chave?"))return;result=await api("/api/pix-key",{method:"PUT",body:JSON.stringify({...payload,confirmReplace:true})});}
  showNotice(pixNotice,result.message);renderPix({pixKey:result.pixKey});pixForm.elements.confirmOwnership.checked=false;
 }catch(error){showNotice(pixNotice,error.message||"Não foi possível salvar a chave Pix.");}
});

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
