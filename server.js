import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 3000);

app.disable("x-powered-by");
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    app: "GlobalPay",
    mode: "non-transactional-demo",
    financialOperationsEnabled: false
  });
});

app.get("/api/status", (_req, res) => {
  res.json({
    environment: process.env.NODE_ENV || "development",
    providerConnected: false,
    transactionsEnabled: false,
    note: "No financial provider is connected. Do not process live transactions."
  });
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Endpoint not found" });
  }
  next();
});

app.listen(port, "0.0.0.0", () => {
  console.log(`GlobalPay demo listening on port ${port}`);
});
