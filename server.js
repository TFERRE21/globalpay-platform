import express from "express";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import webpush from "web-push";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 3000);
const pool = new Pool({
  connectionString: process.env.NF_POSTGRESQL_POSTGRES_URI || process.env.DATABASE_URL,
  ssl: String(process.env.POSTGRES_SSL || "false").toLowerCase() === "true" ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 5000
});
const JWT_SECRET = process.env.JWT_SECRET;
app.disable("x-powered-by");
app.use(express.json({ limit: "25kb" }));
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"], etag: false, maxAge: 0 }));

function normalizePhone(value) {
  let phone = String(value || "").replace(/\D/g, "");
  if (phone.startsWith("00")) phone = phone.slice(2);
  if ((phone.length === 10 || phone.length === 11) && !phone.startsWith("55")) phone = "55" + phone;
  return phone;
}
function signToken(user) {
  if (!JWT_SECRET || JWT_SECRET.length < 32) throw new Error("JWT_SECRET ausente ou muito curto; configure uma chave aleatória com pelo menos 32 caracteres.");
  return jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
}
function auth(req,res,next) {
  try {
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ") || !JWT_SECRET) return res.status(401).json({success:false,message:"Entre na sua conta para continuar."});
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({success:false,message:"Sessão inválida ou expirada. Entre novamente."});
  }
}
async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cv_users (
      id BIGSERIAL PRIMARY KEY, name VARCHAR(140) NOT NULL, email VARCHAR(254) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, phone VARCHAR(20), whatsapp_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
      active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS cv_loan_applications (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES cv_users(id) ON DELETE CASCADE,
      protocol VARCHAR(24) NOT NULL UNIQUE, product VARCHAR(80) NOT NULL, amount_range VARCHAR(80) NOT NULL,
      urgency VARCHAR(80) NOT NULL, status VARCHAR(24) NOT NULL DEFAULT 'RECEBIDO',
      status_note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS cv_loan_applications_user_idx ON cv_loan_applications(user_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS cv_push_subscriptions (id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES cv_users(id) ON DELETE CASCADE, endpoint TEXT NOT NULL UNIQUE, subscription_json JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS cv_password_resets (id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES cv_users(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS cv_support_messages (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES cv_users(id) ON DELETE SET NULL,
      visitor_email VARCHAR(254), role VARCHAR(12) NOT NULL, message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}
async function notifyWhatsApp(phone, title, body) {
  const token=process.env.WHATSAPP_ACCESS_TOKEN, phoneId=process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId || !phone) return {sent:false,reason:"whatsapp_not_configured_or_no_phone"};
  const to=normalizePhone(phone);
  if (!to) return {sent:false,reason:"invalid_phone"};
  const templateName=process.env.WHATSAPP_TEMPLATE_NAME;
  const message=templateName ? {
    messaging_product:"whatsapp",to,type:"template",
    template:{name:templateName,language:{code:process.env.WHATSAPP_TEMPLATE_LANGUAGE||"pt_BR"},components:[{type:"body",parameters:[{type:"text",text:String(title).slice(0,200)},{type:"text",text:String(body).slice(0,900)}]}]}
  } : {messaging_product:"whatsapp",to,type:"text",text:{preview_url:false,body:String(title)+"\n\n"+String(body).slice(0,3000)}};
  try {
    const response=await fetch("https://graph.facebook.com/"+(process.env.WHATSAPP_GRAPH_VERSION||"v23.0")+"/"+phoneId+"/messages",{
      method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(message)
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok){console.error("[CrediViva WhatsApp]",data);return {sent:false,reason:"provider_error"};}
    return {sent:true};
  } catch(error){console.error("[CrediViva WhatsApp]",error.message);return {sent:false,reason:"request_error"};}
}
let schemaReady = null;
async function requireDatabase(req,res,next) {
  try {
    if (!schemaReady) schemaReady = ensureSchema();
    await schemaReady;
    next();
  } catch (error) {
    schemaReady = null;
    console.error("[CrediViva database]", error.message || error);
    res.status(503).json({success:false,message:"O banco de dados ainda não está disponível. Configure NF_POSTGRESQL_POSTGRES_URI ou DATABASE_URL no servidor."});
  }
}
app.use(["/api/auth","/api/loans","/api/admin/loans"], requireDatabase);

app.get("/api/health",(_req,res)=>res.json({status:"ok",app:"CrediViva",mode:"application-tracking",financialProviderConnected:false,loanApprovalAutomatic:false}));
app.get("/api/status",(_req,res)=>res.json({databaseConfigured:!!(process.env.NF_POSTGRESQL_POSTGRES_URI||process.env.DATABASE_URL),whatsappConfigured:!!(process.env.WHATSAPP_ACCESS_TOKEN&&process.env.WHATSAPP_PHONE_NUMBER_ID),financialProviderConnected:false,loanApprovalAutomatic:false}));


app.post("/api/auth/forgot-password",async(req,res)=>{
 try{
  const email=String(req.body?.email||"").trim().toLowerCase();
  if(!/^\S+@\S+\.\S+$/.test(email))return res.status(400).json({success:false,message:"Informe um e-mail válido."});
  const userResult=await pool.query("SELECT id,email,name FROM cv_users WHERE email=$1 AND active=TRUE",[email]);
  // Always return the same public message to avoid disclosing whether an account exists.
  const message="Se houver uma conta associada a esse e-mail, enviaremos as instruções de recuperação.";
  if(userResult.rows.length){
   const user=userResult.rows[0], rawToken=crypto.randomBytes(32).toString("hex"), tokenHash=crypto.createHash("sha256").update(rawToken).digest("hex");
   await pool.query("UPDATE cv_password_resets SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL",[user.id]);
   await pool.query("INSERT INTO cv_password_resets(user_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '30 minutes')",[user.id,tokenHash]);
   const base=String(process.env.PUBLIC_BASE_URL||"").replace(/\/$/,"");
   const resetUrl=base+"/conta.html?reset="+encodeURIComponent(rawToken);
   const apiKey=process.env.RESEND_API_KEY, from=process.env.RESEND_FROM_EMAIL;
   if(apiKey&&from&&base){
    const mail=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+apiKey,"Content-Type":"application/json"},body:JSON.stringify({from,to:[user.email],subject:"Recuperação de senha — CrediViva",html:"<div style='font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#17365d'><h2>Recuperar acesso à CrediViva</h2><p>Olá, "+String(user.name).replace(/[&<>"]/g,"")+"!</p><p>Recebemos um pedido para trocar a senha da sua conta. O link é válido por 30 minutos.</p><p><a href='"+resetUrl+"' style='display:inline-block;background:#2869ff;color:#fff;padding:13px 20px;border-radius:10px;text-decoration:none'>Criar nova senha</a></p><p>Se você não pediu essa alteração, ignore esta mensagem.</p></div>"})});
    if(!mail.ok)console.error("[CrediViva reset email]",await mail.text());
   }else console.warn("[CrediViva reset] Configure RESEND_API_KEY, RESEND_FROM_EMAIL e PUBLIC_BASE_URL para habilitar e-mails.");
  }
  res.json({success:true,message});
 }catch(error){console.error("[CrediViva forgot password]",error);res.status(500).json({success:false,message:"Não foi possível processar a solicitação agora."});}
});
app.post("/api/auth/reset-password",async(req,res)=>{
 try{
  const token=String(req.body?.token||""), password=String(req.body?.password||"");
  if(token.length<32||password.length<8)return res.status(400).json({success:false,message:"Link inválido ou senha com menos de 8 caracteres."});
  const hash=crypto.createHash("sha256").update(token).digest("hex");
  const r=await pool.query("SELECT id,user_id FROM cv_password_resets WHERE token_hash=$1 AND used_at IS NULL AND expires_at>NOW() LIMIT 1",[hash]);
  if(!r.rows.length)return res.status(400).json({success:false,message:"Este link expirou ou já foi usado. Solicite uma nova recuperação."});
  const passwordHash=await bcrypt.hash(password,12);
  await pool.query("BEGIN");
  try{
   await pool.query("UPDATE cv_users SET password_hash=$1,updated_at=NOW() WHERE id=$2",[passwordHash,r.rows[0].user_id]);
   await pool.query("UPDATE cv_password_resets SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL",[r.rows[0].user_id]);
   await pool.query("COMMIT");
  }catch(e){await pool.query("ROLLBACK");throw e;}
  res.json({success:true,message:"Senha alterada. Você já pode entrar com a nova senha."});
 }catch(error){console.error("[CrediViva reset password]",error);res.status(500).json({success:false,message:"Não foi possível alterar a senha."});}
});
app.post("/api/auth/change-password",auth,async(req,res)=>{
 try{
  const currentPassword=String(req.body?.currentPassword||""), newPassword=String(req.body?.newPassword||"");
  if(newPassword.length<8)return res.status(400).json({success:false,message:"A nova senha precisa ter pelo menos 8 caracteres."});
  const r=await pool.query("SELECT password_hash FROM cv_users WHERE id=$1 AND active=TRUE",[req.user.id]);
  if(!r.rows.length||!(await bcrypt.compare(currentPassword,r.rows[0].password_hash)))return res.status(400).json({success:false,message:"A senha atual não confere."});
  const hash=await bcrypt.hash(newPassword,12);
  await pool.query("UPDATE cv_users SET password_hash=$1,updated_at=NOW() WHERE id=$2",[hash,req.user.id]);
  await pool.query("UPDATE cv_password_resets SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL",[req.user.id]);
  res.json({success:true,message:"Senha trocada com sucesso."});
 }catch(error){console.error("[CrediViva change password]",error);res.status(500).json({success:false,message:"Não foi possível trocar a senha."});}
});

app.post("/api/auth/register",async(req,res)=>{
 try {
  const name=String(req.body?.name||"").trim(), email=String(req.body?.email||"").trim().toLowerCase(), password=String(req.body?.password||""), phone=normalizePhone(req.body?.phone);
  const whatsappOptIn=req.body?.whatsappOptIn===true;
  if(name.length<2||name.length>140||!/^\S+@\S+\.\S+$/.test(email)||password.length<8) return res.status(400).json({success:false,message:"Informe nome, e-mail válido e senha com pelo menos 8 caracteres."});
  if(phone && (phone.length<10||phone.length>15)) return res.status(400).json({success:false,message:"Informe um telefone válido com DDD."});
  const hash=await bcrypt.hash(password,12);
  const result=await pool.query("INSERT INTO cv_users(name,email,password_hash,phone,whatsapp_opt_in) VALUES($1,$2,$3,$4,$5) RETURNING id,name,email,phone,whatsapp_opt_in,created_at",[name,email,hash,phone||null,whatsappOptIn]);
  const user=result.rows[0];
  return res.status(201).json({success:true,token:signToken(user),user,message:"Cadastro realizado. Você já pode acompanhar seus pedidos."});
 } catch(error) {
  if(error.code==="23505") return res.status(409).json({success:false,message:"Este e-mail já possui cadastro."});
  console.error("[CrediViva register]",error);
  return res.status(500).json({success:false,message:"Não foi possível concluir o cadastro. Verifique se o banco de dados está configurado."});
 }
});
app.post("/api/auth/login",async(req,res)=>{
 try {
  const email=String(req.body?.email||"").trim().toLowerCase(), password=String(req.body?.password||"");
  const r=await pool.query("SELECT id,name,email,password_hash,phone,whatsapp_opt_in,active FROM cv_users WHERE email=$1",[email]);
  if(!r.rows.length||!r.rows[0].active||!(await bcrypt.compare(password,r.rows[0].password_hash))) return res.status(401).json({success:false,message:"E-mail ou senha inválidos."});
  const user=r.rows[0]; const token=signToken(user); delete user.password_hash;
  return res.json({success:true,token,user});
 } catch(error){console.error("[CrediViva login]",error);return res.status(500).json({success:false,message:"Não foi possível entrar. Verifique a configuração do servidor."});}
});
app.get("/api/auth/me",auth,async(req,res)=>{
 try {const r=await pool.query("SELECT id,name,email,phone,whatsapp_opt_in,created_at FROM cv_users WHERE id=$1",[req.user.id]); if(!r.rows.length)return res.status(404).json({success:false,message:"Conta não encontrada."});res.json({success:true,user:r.rows[0]});}
 catch(error){console.error(error);res.status(500).json({success:false,message:"Erro ao carregar a conta."});}
});
app.put("/api/auth/phone",auth,async(req,res)=>{
 try {
  const phone=normalizePhone(req.body?.phone), whatsappOptIn=req.body?.whatsappOptIn===true;
  if(phone&&(phone.length<10||phone.length>15))return res.status(400).json({success:false,message:"Informe um telefone válido com DDD."});
  const r=await pool.query("UPDATE cv_users SET phone=$1,whatsapp_opt_in=$2,updated_at=NOW() WHERE id=$3 RETURNING id,name,email,phone,whatsapp_opt_in",[phone||null,whatsappOptIn,req.user.id]);
  res.json({success:true,user:r.rows[0],message:"Telefone e preferências atualizados."});
 }catch(error){console.error(error);res.status(500).json({success:false,message:"Não foi possível atualizar o telefone."});}
});
app.post("/api/loans",auth,async(req,res)=>{
 try {
  const product=String(req.body?.product||"").slice(0,80), amount=String(req.body?.amount||"").slice(0,80), urgency=String(req.body?.urgency||"").slice(0,80);
  if(!product||!amount||!urgency)return res.status(400).json({success:false,message:"Selecione a modalidade, a faixa de valor e quando precisa do crédito."});
  const protocol="CV-"+crypto.randomBytes(5).toString("hex").toUpperCase();
  const r=await pool.query("INSERT INTO cv_loan_applications(user_id,protocol,product,amount_range,urgency,status,status_note) VALUES($1,$2,$3,$4,$5,'RECEBIDO','Solicitação registrada. Ainda não foi enviada a uma instituição financeira.') RETURNING id,protocol,product,amount_range,urgency,status,status_note,created_at,updated_at",[req.user.id,protocol,product,amount,urgency]);
  res.status(201).json({success:true,application:r.rows[0],message:"Solicitação registrada para acompanhamento. Ela ainda não representa uma proposta enviada ao banco."});
 }catch(error){console.error("[CrediViva loan create]",error);res.status(500).json({success:false,message:"Não foi possível registrar a solicitação. Confira o banco de dados."});}
});
app.get("/api/loans",auth,async(req,res)=>{
 try {const r=await pool.query("SELECT id,protocol,product,amount_range,urgency,status,status_note,created_at,updated_at FROM cv_loan_applications WHERE user_id=$1 ORDER BY created_at DESC",[req.user.id]);res.json({success:true,applications:r.rows});}
 catch(error){console.error(error);res.status(500).json({success:false,message:"Não foi possível consultar as solicitações."});}
});

function pushIsConfigured(){return !!(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY&&process.env.VAPID_SUBJECT);}
function configureWebPush(){if(pushIsConfigured())webpush.setVapidDetails(process.env.VAPID_SUBJECT,process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);}
app.get("/api/notifications/vapid-public-key",(req,res)=>{
 if(!pushIsConfigured())return res.status(503).json({success:false,message:"Notificações do navegador ainda não configuradas no servidor."});
 res.json({success:true,publicKey:process.env.VAPID_PUBLIC_KEY});
});
app.post("/api/notifications/subscribe",auth,async(req,res)=>{
 try{
  if(!pushIsConfigured())return res.status(503).json({success:false,message:"Notificações ainda não configuradas no servidor."});
  const sub=req.body?.subscription;
  if(!sub?.endpoint||!sub?.keys?.p256dh||!sub?.keys?.auth)return res.status(400).json({success:false,message:"Assinatura do navegador inválida."});
  await pool.query("INSERT INTO cv_push_subscriptions(user_id,endpoint,subscription_json,updated_at) VALUES($1,$2,$3,NOW()) ON CONFLICT(endpoint) DO UPDATE SET user_id=EXCLUDED.user_id,subscription_json=EXCLUDED.subscription_json,updated_at=NOW()",[req.user.id,sub,JSON.stringify(sub)]);
  res.json({success:true,message:"Notificações deste celular ativadas."});
 }catch(error){console.error("[CrediViva push subscribe]",error);res.status(500).json({success:false,message:"Não foi possível ativar as notificações."});}
});
app.post("/api/notifications/test",auth,async(req,res)=>{
 try{
  configureWebPush();
  const result=await pool.query("SELECT id,endpoint,subscription_json FROM cv_push_subscriptions WHERE user_id=$1",[req.user.id]);
  if(!result.rows.length)return res.status(404).json({success:false,message:"Ative as notificações neste celular primeiro."});
  let sent=0;
  for(const row of result.rows){
   try{await webpush.sendNotification(row.subscription_json,JSON.stringify({title:"🔔 CrediViva — teste",body:"As notificações estão funcionando. Você receberá avisos sobre o andamento da sua solicitação.",url:"/conta.html",tag:"crediviva-test"}),{TTL:300,urgency:"normal"});sent++;}
   catch(error){if([404,410].includes(Number(error.statusCode)))await pool.query("DELETE FROM cv_push_subscriptions WHERE id=$1",[row.id]);else console.error("[CrediViva push test]",error.message);}
  }
  res.json({success:sent>0,message:sent>0?"Notificação de teste enviada.":"Não foi possível enviar. Confira a permissão do navegador e as chaves VAPID.",sent});
 }catch(error){console.error("[CrediViva push test]",error);res.status(500).json({success:false,message:"Erro ao enviar notificação de teste."});}
});
async function notifyLoanPush(userId,item,note){
 if(!pushIsConfigured())return {sent:false,reason:"vapid_not_configured"};
 try{
  configureWebPush();
  const r=await pool.query("SELECT id,endpoint,subscription_json FROM cv_push_subscriptions WHERE user_id=$1",[userId]);
  let sent=0;
  const statusText=String(item.status).replaceAll("_"," ");
  const titles={APROVADO:"✅ Empréstimo aprovado",RECUSADO:"❌ Solicitação atualizada",EM_ANALISE:"🔎 Empréstimo em análise",DOCUMENTOS_PENDENTES:"📄 Documentos pendentes",CANCELADO:"Solicitação cancelada",RECEBIDO:"📩 Solicitação recebida"};
  for(const row of r.rows){
   try{await webpush.sendNotification(row.subscription_json,JSON.stringify({title:titles[item.status]||"🔔 Atualização CrediViva",body:"Protocolo "+item.protocol+" • "+statusText+(note?" — "+note:""),url:"/conta.html",tag:"crediviva-loan-"+item.id}),{TTL:86400,urgency:"high"});sent++;}
   catch(error){if([404,410].includes(Number(error.statusCode)))await pool.query("DELETE FROM cv_push_subscriptions WHERE id=$1",[row.id]);else console.error("[CrediViva push]",error.message);}
  }
  return {sent:sent>0,count:sent};
 }catch(error){console.error("[CrediViva push status]",error);return {sent:false,reason:"push_error"};}
}

app.post("/api/admin/loans/:id/status",async(req,res)=>{
 const supplied=String(req.headers["x-admin-token"]||"");
 const expectedAdminToken=String(process.env.CREDIVIVA_ADMIN_TOKEN||"");
 const suppliedHash=crypto.createHash("sha256").update(supplied).digest();
 const expectedHash=crypto.createHash("sha256").update(expectedAdminToken).digest();
 if(!expectedAdminToken||!crypto.timingSafeEqual(suppliedHash,expectedHash))return res.status(401).json({success:false,message:"Acesso administrativo não autorizado."});
 const status=String(req.body?.status||"").toUpperCase(), note=String(req.body?.note||"").trim().slice(0,1000);
 const allowed=["RECEBIDO","EM_ANALISE","DOCUMENTOS_PENDENTES","APROVADO","RECUSADO","CANCELADO"];
 if(!allowed.includes(status))return res.status(400).json({success:false,message:"Status inválido."});
 try {
  const r=await pool.query("UPDATE cv_loan_applications SET status=$1,status_note=$2,updated_at=NOW() WHERE id=$3 RETURNING id,user_id,protocol,product,status,status_note,updated_at",[status,note||null,req.params.id]);
  if(!r.rows.length)return res.status(404).json({success:false,message:"Solicitação não encontrada."});
  const item=r.rows[0], u=await pool.query("SELECT phone,whatsapp_opt_in FROM cv_users WHERE id=$1",[item.user_id]);
  let whatsapp={sent:false,reason:"whatsapp_opt_in_not_enabled"};
  if(u.rows[0]?.phone&&u.rows[0]?.whatsapp_opt_in)whatsapp=await notifyWhatsApp(u.rows[0].phone,"Atualização da CrediViva — "+item.protocol,"O status da sua solicitação mudou para: "+item.status.replaceAll("_"," ")+". "+(note||"Entre na sua conta para ver os detalhes.")+" Acompanhe seu pedido no site.");
  const push=await notifyLoanPush(item.user_id,item,note);
  res.json({success:true,application:item,notifications:{whatsapp,push}});
 }catch(error){console.error("[CrediViva admin status]",error);res.status(500).json({success:false,message:"Não foi possível atualizar o status."});}
});
app.post("/api/support/chat",async(req,res)=>{
 try {
  const message=String(req.body?.message||"").trim().slice(0,4000);
  if(!message)return res.status(400).json({success:false,message:"Digite sua dúvida."});
  const apiKey=process.env.OPENAI_API_KEY;
  if(!apiKey){
   const q=message.toLocaleLowerCase("pt-BR");
   let reply="Posso ajudar com cadastro, modalidades de crédito e acompanhamento. Para consultar um pedido específico, entre em Minha Conta. A CrediViva não confirma aprovação sem atualização registrada no sistema.";
   if(/como funciona|como funciona o site|funciona/.test(q)) reply="A CrediViva ajuda você a conhecer modalidades de crédito e registrar uma solicitação para acompanhamento. Escolha uma opção na página inicial, informe a faixa de valor e o prazo, crie sua conta e acompanhe o protocolo em Minha Conta. O registro no site não significa que a proposta já foi enviada a um banco.";
   else if(/cadastro|cadastrar|conta|senha|entrar|login/.test(q)) reply="Para criar sua conta, toque em Minha Conta no topo do site e escolha Criar cadastro. Informe seu nome, e-mail, senha e celular com DDD. Depois você poderá consultar suas solicitações e preferências de notificação.";
   else if(/status|acompanhar|protocolo|andamento|aprovad|recusad|análise|analise/.test(q)) reply="Entre em Minha Conta para consultar o protocolo e o status registrado. Os estados podem incluir recebido, em análise, documentos pendentes, aprovado ou recusado. A decisão final depende da instituição financeira e só será exibida quando o status for atualizado.";
   else if(/whatsapp|notifica|celular|mensagem/.test(q)) reply="Em Minha Conta, informe seu celular e autorize os avisos pelo WhatsApp. As mensagens só serão enviadas quando o serviço de WhatsApp estiver configurado no sistema. Você também pode ativar notificações do navegador, se essa função estiver configurada.";
   else if(/banco|empréstimo|emprestimo|crédito|credito|juros/.test(q)) reply="As opções apresentadas são informativas. Taxas, elegibilidade, disponibilidade e aprovação dependem da instituição financeira. Não pague taxa antecipada para liberar empréstimo e não compartilhe senhas ou códigos de segurança.";
   return res.json({success:true,reply});
  }
  const r=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+apiKey},body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-4o-mini",messages:[{role:"system",content:"Você é o assistente de suporte da CrediViva. Responda em português brasileiro, com clareza e cordialidade. Explique cadastro, acompanhamento e conceitos gerais. Nunca afirme que uma proposta foi enviada, aprovada ou recusada sem consultar o painel autenticado. Nunca solicite senha, código de autenticação, número completo de cartão ou pagamento antecipado. Deixe claro que a CrediViva não garante aprovação e que a decisão é da instituição financeira."},{role:"user",content:message}],temperature:0.25,max_tokens:450})});
  const data=await r.json().catch(()=>({}));
  if(!r.ok){console.error("[CrediViva chat]",data);return res.status(502).json({success:false,message:"Atendimento temporariamente indisponível."});}
  const answer=data?.choices?.[0]?.message?.content?.trim();
  if(!answer)return res.status(502).json({success:false,message:"Não foi possível gerar uma resposta."});
  res.json({success:true,reply:answer});
 }catch(error){console.error("[CrediViva chat]",error);res.status(500).json({success:false,message:"Não foi possível processar a mensagem."});}
});
app.use((req,res,next)=>req.path.startsWith("/api/")?res.status(404).json({error:"Endpoint not found"}):next());
app.listen(port,"0.0.0.0",()=>console.log("CrediViva listening on port "+port));
