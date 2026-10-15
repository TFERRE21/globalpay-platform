const year=document.querySelector("#year");if(year)year.textContent=String(new Date().getFullYear());
const products={
 veiculo:{title:"Empréstimo com garantia de veículo",description:"A disponibilidade, avaliação, juros e condições dependem de instituição habilitada e análise do bem."},
 cartao:{title:"Crédito pelo cartão",description:"A modalidade depende das regras e da disponibilidade do parceiro financeiro."},
 pessoal:{title:"Empréstimo pessoal / CLT",description:"A elegibilidade e as condições dependem da análise da instituição financeira."},
 imovel:{title:"Crédito com garantia de imóvel",description:"Avaliação, custos, prazos e disponibilidade dependem de instituição habilitada e análise do bem."}
};
const cards=[...document.querySelectorAll("[data-product]")],panel=document.querySelector("#selection-panel"),title=document.querySelector("#selection-title"),description=document.querySelector("#selection-description"),amount=document.querySelector("#amount"),urgency=document.querySelector("#urgency"),result=document.querySelector("#selection-result");let selectedProduct="";
function chooseProduct(key){selectedProduct=key;const product=products[key];if(!product||!panel||!title||!description)return;title.textContent=product.title;description.textContent=product.description;panel.hidden=false;if(result)result.hidden=true;cards.forEach(card=>card.setAttribute("aria-pressed",String(card.dataset.product===key)));panel.scrollIntoView({behavior:"smooth",block:"start"});}
cards.forEach(card=>card.addEventListener("click",()=>chooseProduct(card.dataset.product)));
document.querySelector("#change-product")?.addEventListener("click",()=>{panel.hidden=true;cards.forEach(card=>card.setAttribute("aria-pressed","false"));selectedProduct="";if(result)result.hidden=true;});
document.querySelector("#continue-application")?.addEventListener("click",async()=>{
 if(!selectedProduct||!amount||!urgency||!result)return;
 if(!amount.value||!urgency.value){result.hidden=false;result.textContent="Selecione a faixa de valor e quando precisa do crédito.";return;}
 const token=localStorage.getItem("crediviva-token");
 if(!token){localStorage.setItem("crediviva-pending-loan",JSON.stringify({product:selectedProduct,amount:amount.value,urgency:urgency.value}));location.href="/conta.html?cadastro=1";return;}
 try{
  const response=await fetch("/api/loans",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({product:products[selectedProduct].title,amount:amount.value,urgency:urgency.value})});
  const data=await response.json();if(!response.ok)throw new Error(data.message||"Não foi possível registrar.");
  result.hidden=false;result.textContent="Solicitação registrada. Protocolo: "+data.application.protocol+". Acompanhe o andamento em Minha conta. Nenhuma proposta foi enviada a um banco automaticamente.";
 }catch(error){result.hidden=false;result.textContent=error.message;}
});
const themeToggle=document.querySelector("#theme-toggle"),themeIcon=document.querySelector("#theme-icon"),themeLabel=document.querySelector(".theme-label"),themeMeta=document.querySelector("#theme-color-meta");
function setTheme(theme){document.documentElement.dataset.theme=theme;const light=theme==="light";if(themeIcon)themeIcon.textContent=light?"☀":"☾";if(themeLabel)themeLabel.textContent="Tema";if(themeToggle)themeToggle.setAttribute("aria-label",light?"Ativar tema escuro":"Ativar tema claro");if(themeMeta)themeMeta.setAttribute("content",light?"#f4f8fc":"#071426");try{localStorage.setItem("globalpay-theme",theme);}catch(_){}}
let initialTheme="light";try{const saved=localStorage.getItem("globalpay-theme");if(saved==="light"||saved==="dark")initialTheme=saved;}catch(_){}setTheme(initialTheme);themeToggle?.addEventListener("click",()=>setTheme(document.documentElement.dataset.theme==="light"?"dark":"light"));
function addSupportChat(){
 if(document.querySelector(".support-launcher"))return;
 const launcher=document.createElement("button");launcher.className="support-launcher";launcher.type="button";launcher.textContent="💬 Falar com suporte";
 const widget=document.createElement("section");widget.className="support-widget";widget.setAttribute("aria-label","Suporte CrediViva");
 widget.innerHTML='<div class="support-head"><div><strong>Atendimento CrediViva</strong><small>Como podemos ajudar?</small></div><button class="support-close" type="button" aria-label="Fechar">×</button></div><div class="support-log"><div class="support-bubble">Olá! Posso ajudar com cadastro, acompanhamento da solicitação e dúvidas gerais. Nunca envie senha ou códigos de segurança.</div></div><form class="support-form"><input name="message" maxlength="4000" placeholder="Digite sua dúvida..." required aria-label="Sua mensagem"><button type="submit">Enviar</button></form>';
 document.body.append(launcher,widget);launcher.addEventListener("click",()=>widget.classList.toggle("open"));widget.querySelector(".support-close").addEventListener("click",()=>widget.classList.remove("open"));
 const form=widget.querySelector("form"),input=form.elements.message,log=widget.querySelector(".support-log");
 form.addEventListener("submit",async e=>{e.preventDefault();const message=input.value.trim();if(!message)return;const user=document.createElement("div");user.className="support-bubble user";user.textContent=message;log.append(user);input.value="";const wait=document.createElement("div");wait.className="support-bubble";wait.textContent="Só um instante...";log.append(wait);log.scrollTop=log.scrollHeight;try{const r=await fetch("/api/support/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message})});const data=await r.json();wait.textContent=data.reply||data.message||"Atendimento temporariamente indisponível.";}catch(_){wait.textContent="Não foi possível conectar ao suporte agora.";}log.scrollTop=log.scrollHeight;});
}
addSupportChat();
