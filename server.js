import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json());

const sectors = ["Britagem", "Processamento", "Rejeitos", "Transporte"];
const sectorProfiles = {
  Britagem: { base: 620, volatility: 95 },
  Processamento: { base: 880, volatility: 130 },
  Rejeitos: { base: 540, volatility: 170 },
  Transporte: { base: 330, volatility: 65 }
};

const state = {
  reuseActive: false,
  mode: "manual",
  demandBoostUntil: 0,
  history: [],
  alerts: [],
  notifications: [],
  esgReports: [],
  tick: 0,
  waterSaved: 0,
  co2Avoided: 0,
  current: {
    sectors: {},
    total: 0,
    dailyTotal: 218000,
    efficiency: 76,
    savingsBRL: 0,
    risk: "baixo"
  }
};

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function round(value, digits = 0) {
  return Number(value.toFixed(digits));
}

function riskFromTotal(total) {
  if (total > 3100) return "alto";
  if (total > 2450) return "medio";
  return "baixo";
}

function pushNotification(message, type = "info") {
  state.notifications.unshift({ id: crypto.randomUUID(), message, type, time: new Date().toLocaleTimeString("pt-BR") });
  state.notifications = state.notifications.slice(0, 6);
}

function createAlert(sector, value, severity) {
  const existing = state.alerts.find((alert) => alert.sector === sector && alert.status === "aberto");
  if (existing) return;
  const alert = {
    id: crypto.randomUUID(),
    sector,
    time: new Date().toLocaleTimeString("pt-BR"),
    severity,
    value: round(value),
    status: "aberto"
  };
  state.alerts.unshift(alert);
  pushNotification(`Alerta ${severity} detectado no setor ${sector.toLowerCase()}`, severity === "critica" ? "critical" : "warning");
}

function resolveAlert(id, automatic = false) {
  const alert = state.alerts.find((item) => item.id === id);
  if (!alert) return false;
  state.alerts = state.alerts.filter((item) => item.id !== id);
  pushNotification(`${automatic ? "Automacao" : "Operador"} resolveu alerta em ${alert.sector}`, "success");
  return true;
}

function runPrediction() {
  const recent = state.history.slice(-16);
  const average = recent.reduce((sum, item) => sum + item.total, 0) / Math.max(recent.length, 1);
  const trend = recent.length > 5 ? recent.at(-1).total - recent.at(-5).total : 0;
  const predicted = Math.max(0, average + trend * 0.55 + rand(-80, 120));
  const risk = riskFromTotal(predicted);
  return {
    predictedConsumption: round(predicted),
    wasteRisk: risk === "alto" ? "Alto" : risk === "medio" ? "Medio" : "Baixo",
    risk,
    confidence: round(rand(82, 96), 1),
    recommendation:
      risk === "alto"
        ? "Ativar reuso, reduzir vazao de rejeitos e priorizar circuito fechado."
        : risk === "medio"
          ? "Monitorar picos e ajustar pressao nos setores de maior carga."
          : "Operacao estavel, manter parametros atuais."
  };
}

function simulateTick() {
  state.tick += 1;
  const boost = Date.now() < state.demandBoostUntil ? 1.34 : 1;
  const reuseFactor = state.reuseActive ? 0.7 : 1;
  const sectorsNow = {};
  let total = 0;

  for (const sector of sectors) {
    const profile = sectorProfiles[sector];
    const wave = Math.sin((state.tick + sectors.indexOf(sector) * 2) / 5) * profile.volatility;
    const spike = Math.random() < 0.08 ? rand(220, sector === "Rejeitos" ? 720 : 470) : 0;
    const dip = Math.random() < 0.05 ? rand(80, 210) : 0;
    const value = Math.max(90, (profile.base + wave + rand(-profile.volatility, profile.volatility) + spike - dip) * boost * reuseFactor);
    sectorsNow[sector] = round(value);
    total += value;
    const threshold = profile.base * boost * reuseFactor * 1.43;
    if (value > threshold) createAlert(sector, value, value > threshold * 1.22 ? "critica" : "alta");
  }

  if (state.mode === "automatico" && state.alerts.length) {
    for (const alert of state.alerts.slice(0, 2)) resolveAlert(alert.id, true);
    total *= 0.88;
    pushNotification("Modo automatico reduziu vazao para conter desperdicio", "success");
  }

  const baselineTotal = sectors.reduce((sum, sector) => sum + sectorProfiles[sector].base, 0);
  const savedThisMinute = Math.max(0, baselineTotal - total);
  state.waterSaved += savedThisMinute / 30;
  state.co2Avoided = state.waterSaved * 0.00042;

  const risk = riskFromTotal(total);
  const efficiency = Math.min(98, Math.max(48, 93 - (total - 1900) / 42 + (state.reuseActive ? 6 : 0)));
  state.current = {
    sectors: sectorsNow,
    total: round(total),
    dailyTotal: round(state.current.dailyTotal + total / 30),
    efficiency: round(efficiency, 1),
    savingsBRL: round(state.waterSaved * 0.018, 2),
    risk
  };

  state.history.push({ time: new Date().toLocaleTimeString("pt-BR"), total: state.current.total, sectors: sectorsNow, risk });
  state.history = state.history.slice(-80);
}

function getEsg() {
  const index = Math.max(0, Math.min(100, state.current.efficiency * 0.66 + (state.reuseActive ? 16 : 2) - state.alerts.length * 3));
  return {
    waterSaved: round(state.waterSaved),
    co2Avoided: round(state.co2Avoided, 2),
    index: round(index),
    status: index >= 78 ? "Verde" : index >= 58 ? "Amarelo" : "Vermelho"
  };
}

for (let i = 0; i < 18; i += 1) simulateTick();
setInterval(simulateTick, 2000);

app.get("/api/state", (req, res) => {
  res.json({
    metrics: state.current,
    reuseActive: state.reuseActive,
    mode: state.mode,
    alerts: state.alerts,
    notifications: state.notifications,
    history: state.history,
    esg: getEsg(),
    prediction: runPrediction()
  });
});

app.post("/api/reuse", (req, res) => {
  state.reuseActive = Boolean(req.body.active);
  pushNotification(state.reuseActive ? "Sistema de reuso ativo - economia otimizada" : "Sistema de reuso desativado", state.reuseActive ? "success" : "warning");
  simulateTick();
  res.json({ ok: true, reuseActive: state.reuseActive });
});

app.post("/api/mode", (req, res) => {
  state.mode = req.body.mode === "automatico" ? "automatico" : "manual";
  pushNotification(`Modo ${state.mode} ativado`, "info");
  res.json({ ok: true, mode: state.mode });
});

app.post("/api/predict", (req, res) => {
  const prediction = runPrediction();
  pushNotification("Analise preditiva concluida pela IA", prediction.risk === "alto" ? "warning" : "success");
  res.json(prediction);
});

app.post("/api/digital-twin/demand", (req, res) => {
  state.demandBoostUntil = Date.now() + 18000;
  pushNotification("Digital Twin simulou aumento de demanda operacional", "warning");
  simulateTick();
  res.json({ ok: true, until: state.demandBoostUntil });
});

app.delete("/api/alerts/:id", (req, res) => {
  res.json({ ok: resolveAlert(req.params.id) });
});

app.post("/api/esg/report", (req, res) => {
  const report = {
    id: crypto.randomUUID(),
    createdAt: new Date().toLocaleString("pt-BR"),
    metrics: state.current,
    esg: getEsg(),
    alertsOpen: state.alerts.length,
    prediction: runPrediction(),
    summary: "AquaMine AI consolidou consumo, reuso, riscos e impacto ESG com dados simulados em memoria."
  };
  state.esgReports.unshift(report);
  res.json(report);
});

app.use(express.static(path.join(__dirname, "frontend")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "index.html"));
});

app.listen(port, () => {
  console.log(`AquaMine AI rodando em http://localhost:${port}`);
});
