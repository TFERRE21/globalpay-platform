const year = document.querySelector("#year");
if (year) year.textContent = String(new Date().getFullYear());

const form = document.querySelector("#interest-form");
const email = document.querySelector("#interest-email");
const feedback = document.querySelector("#form-feedback");

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = email?.value?.trim();
  if (!value) return;
  const subject = encodeURIComponent("Interesse no lançamento da GlobalPay");
  const body = encodeURIComponent("Olá, tenho interesse em acompanhar o lançamento da GlobalPay.\n\nMeu e-mail: " + value);
  if (feedback) feedback.textContent = "Seu aplicativo de e-mail será aberto. Nenhum dado foi enviado ao servidor.";
  window.location.href = "mailto:contato@globalpay.example?subject=" + subject + "&body=" + body;
});
