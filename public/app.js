const year = document.querySelector("#year");
if (year) year.textContent = String(new Date().getFullYear());

const products = {
  cartao: {
    title: "Crédito pelo cartão",
    description: "Você selecionou alternativas relacionadas ao cartão. A disponibilidade e as regras dependem do parceiro financeiro e da modalidade autorizada."
  },
  pessoal: {
    title: "Empréstimo pessoal",
    description: "Você selecionou empréstimo pessoal. Uma proposta real dependerá da elegibilidade, análise de crédito e condições apresentadas por um parceiro."
  },
  clt: {
    title: "Consignado CLT",
    description: "Você selecionou consignado CLT. A disponibilidade depende do vínculo de trabalho, dos critérios aplicáveis e da análise do parceiro."
  }
};

const cards = [...document.querySelectorAll("[data-product]")];
const panel = document.querySelector("#selection-panel");
const title = document.querySelector("#selection-title");
const description = document.querySelector("#selection-description");
const amount = document.querySelector("#amount");
const urgency = document.querySelector("#urgency");
const result = document.querySelector("#selection-result");
let selectedProduct = "";

function chooseProduct(key) {
  selectedProduct = key;
  const product = products[key];
  if (!product || !panel || !title || !description) return;
  title.textContent = product.title;
  description.textContent = product.description;
  panel.hidden = false;
  result.hidden = true;
  cards.forEach(card => card.setAttribute("aria-pressed", String(card.dataset.product === key)));
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

cards.forEach(card => card.addEventListener("click", () => chooseProduct(card.dataset.product)));

document.querySelector("#change-product")?.addEventListener("click", () => {
  panel.hidden = true;
  cards.forEach(card => card.setAttribute("aria-pressed", "false"));
  selectedProduct = "";
  result.hidden = true;
});

document.querySelector("#continue-application")?.addEventListener("click", () => {
  if (!selectedProduct || !amount || !urgency || !result) return;
  if (!amount.value || !urgency.value) {
    result.hidden = false;
    result.textContent = "Selecione a faixa de valor e quando precisa do crédito para continuar nesta demonstração.";
    return;
  }
  result.hidden = false;
  result.innerHTML = "<strong>Etapa demonstrativa concluída.</strong><br>Modalidade: " +
    products[selectedProduct].title + ".<br>Faixa desejada: " + amount.value +
    ".<br>Prazo: " + urgency.value +
    ".<br><br>Nenhuma solicitação foi enviada, nenhum CPF foi consultado e nenhum dado foi armazenado. A contratação será habilitada somente após integração e validação de um parceiro financeiro.";
});


const themeToggle = document.querySelector("#theme-toggle");
const themeIcon = document.querySelector("#theme-icon");
const themeLabel = document.querySelector(".theme-label");
const themeMeta = document.querySelector("#theme-color-meta");
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const light = theme === "light";
  if (themeIcon) themeIcon.textContent = light ? "☾" : "☀";
  if (themeLabel) themeLabel.textContent = light ? "Tema escuro" : "Tema claro";
  if (themeToggle) themeToggle.setAttribute("aria-label", light ? "Ativar tema escuro" : "Ativar tema claro");
  if (themeMeta) themeMeta.setAttribute("content", light ? "#f4f7fb" : "#071426");
  try { localStorage.setItem("globalpay-theme", theme); } catch (_) {}
}
let initialTheme = "dark";
try {
  const savedTheme = localStorage.getItem("globalpay-theme");
  if (savedTheme === "light" || savedTheme === "dark") initialTheme = savedTheme;
  else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) initialTheme = "light";
} catch (_) {}
setTheme(initialTheme);
themeToggle?.addEventListener("click", () => {
  setTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
});
