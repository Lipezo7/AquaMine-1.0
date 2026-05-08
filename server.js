import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json());

const sectors = ["Britagem", "Processamento", "Rejeitos", "Transporte"];
const sectorProfiles = {
  Britagem: { base: 620, volatility: 95, solids: 7 },
  Processamento: { base: 880, volatility: 130, solids: 10 },
  Rejeitos: { base: 540, volatility: 170, solids: 18 },
  Transporte: { base: 330, volatility: 65, solids: 4 }
};

const state = {
  reuseActive: false,
  mode: "manual",
  demandBoostUntil: 0,
  qualityStressUntil: 0,
  history: [],
  qualityHistory: [],
  alerts: [],
  notifications: [],
  esgReports: [],
  tick: 0,
  waterSaved: 0,
  co2Avoided: 0,
  treatment: {
    chemicalDose: 38,
    flowRate: 74,
    retentionTime: 42,
    autoAdjustments: 0,
    lastAction: "Parametros iniciais calibrados para reuso."
  },
  current: {
    sectors: {},
    total: 0,
    dailyTotal: 218000,
    efficiency: 76,
    savingsBRL: 0,
    risk: "baixo",
    quality: {}
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

function qualityStatus(score) {
  if (score < 62) return "critica";
  if (score < 76) return "atencao";
  return "adequada";
}

function pushNotification(message, type = "info") {
  state.notifications.unshift({ id: crypto.randomUUID(), message, type, time: new Date().toLocaleTimeString("pt-BR") });
  state.notifications = state.notifications.slice(0, 6);
}

function createAlert(sector, value, severity, kind = "consumo") {
  const existing = state.alerts.find((alert) => alert.sector === sector && alert.kind === kind && alert.status === "aberto");
  if (existing) return;
  const alert = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    sector,
    time: new Date().toLocaleTimeString("pt-BR"),
    severity,
    value: round(value, kind === "qualidade" ? 1 : 0),
    kind,
    status: "aberto",
    automaticAction: null
  };
  state.alerts.unshift(alert);
  const label = kind === "qualidade" ? "qualidade da agua" : "consumo";
  pushNotification(`Alerta ${severity} de ${label} em ${sector.toLowerCase()}`, severity === "critica" ? "critical" : "warning");
  return alert;
}

function resolveAlert(id, automatic = false) {
  const alert = state.alerts.find((item) => item.id === id);
  if (!alert) return false;
  state.alerts = state.alerts.filter((item) => item.id !== id);
  pushNotification(`${automatic ? "Automacao" : "Operador"} resolveu alerta em ${alert.sector}`, "success");
  return true;
}

function getDataIslands() {
  const quality = state.current.quality;
  return [
    {
      name: "Sensores de qualidade",
      source: "pH, turbidez, TSS e condutividade",
      freshness: "tempo real",
      status: quality.score < 70 ? "atencao" : "integrado",
      confidence: round(Math.max(71, quality.score || 82))
    },
    {
      name: "Etapas do processo",
      source: "britagem, processamento, rejeitos e transporte",
      freshness: "tempo real",
      status: "integrado",
      confidence: 94
    },
    {
      name: "Tratamento de agua",
      source: "dosagem, vazao e tempo de retencao",
      freshness: "tempo real",
      status: state.treatment.autoAdjustments > 0 ? "atuando" : "integrado",
      confidence: 91
    },
    {
      name: "Historico operacional",
      source: `${state.history.length} leituras recentes em memoria`,
      freshness: "aprendizado continuo",
      status: "integrado",
      confidence: 88
    }
  ];
}

function runPrediction() {
  const recentFlow = state.history.slice(-16);
  const recentQuality = state.qualityHistory.slice(-16);
  const avgFlow = recentFlow.reduce((sum, item) => sum + item.total, 0) / Math.max(recentFlow.length, 1);
  const flowTrend = recentFlow.length > 5 ? recentFlow.at(-1).total - recentFlow.at(-5).total : 0;
  const avgQuality = recentQuality.reduce((sum, item) => sum + item.score, 0) / Math.max(recentQuality.length, 1);
  const qualityTrend = recentQuality.length > 5 ? recentQuality.at(-1).score - recentQuality.at(-5).score : 0;
  const predictedConsumption = Math.max(0, avgFlow + flowTrend * 0.55 + rand(-80, 120));
  const predictedQuality = Math.max(35, Math.min(98, avgQuality + qualityTrend * 0.8 - (predictedConsumption > 2850 ? 6 : 0) + rand(-2, 3)));
  const risk = predictedQuality < 62 || predictedConsumption > 3100 ? "alto" : predictedQuality < 76 || predictedConsumption > 2450 ? "medio" : "baixo";
  return {
    predictedConsumption: round(predictedConsumption),
    predictedQuality: round(predictedQuality, 1),
    wasteRisk: risk === "alto" ? "Alto" : risk === "medio" ? "Medio" : "Baixo",
    qualityRisk: qualityStatus(predictedQuality),
    risk,
    confidence: round(rand(84, 96), 1),
    recommendation:
      risk === "alto"
        ? "Aumentar dosagem quimica, reduzir vazao de entrada e elevar tempo de retencao antes do reuso."
        : risk === "medio"
          ? "Ajustar vazao e acompanhar turbidez dos rejeitos para evitar queda de qualidade."
          : "Qualidade e consumo estaveis para manter reuso no processo."
  };
}

function adjustTreatment(reason = "controle preditivo") {
  state.treatment.chemicalDose = Math.min(72, state.treatment.chemicalDose + rand(3, 7));
  state.treatment.flowRate = Math.max(48, state.treatment.flowRate - rand(3, 7));
  state.treatment.retentionTime = Math.min(72, state.treatment.retentionTime + rand(3, 6));
  state.treatment.autoAdjustments += 1;
  state.treatment.lastAction = `Ajuste automatico por ${reason}: dosagem elevada, vazao reduzida e retencao ampliada.`;
  pushNotification("Tratamento ajustado automaticamente para preservar qualidade de reuso", "success");
}

function markAutomaticResponse(alert, action) {
  alert.automaticAction = action;
  alert.status = "em_contencao";
  alert.autoResolveAt = Date.now() + 14000;
}

function simulateQuality(total, solidsLoad) {
  const stress = Date.now() < state.qualityStressUntil ? 1 : 0;
  const treatmentEffect = (state.treatment.chemicalDose - 34) * 0.32 + (state.treatment.retentionTime - 38) * 0.2 - (state.treatment.flowRate - 70) * 0.11;
  const loadPenalty = solidsLoad * 0.42 + (total > 2800 ? (total - 2800) / 85 : 0) + stress * rand(8, 16);
  const score = Math.max(38, Math.min(98, 88 + treatmentEffect - loadPenalty + rand(-3, 3)));
  const ph = Math.max(5.9, Math.min(8.8, 7.25 - stress * 0.35 - solidsLoad / 120 + treatmentEffect / 70 + rand(-0.08, 0.08)));
  const turbidity = Math.max(8, 22 + solidsLoad * 1.9 + stress * rand(16, 30) - treatmentEffect * 1.1 + rand(-4, 5));
  const tss = Math.max(60, 130 + solidsLoad * 5.8 + stress * rand(70, 130) - treatmentEffect * 3 + rand(-14, 18));
  const conductivity = Math.max(380, 760 + solidsLoad * 7 + stress * rand(80, 160) + rand(-35, 45));
  return {
    score: round(score, 1),
    status: qualityStatus(score),
    ph: round(ph, 2),
    turbidity: round(turbidity, 1),
    tss: round(tss),
    conductivity: round(conductivity),
    reuseReady: score >= 76 && ph >= 6.5 && ph <= 8.2 && turbidity < 75
  };
}

function simulateTick() {
  state.tick += 1;
  const boost = Date.now() < state.demandBoostUntil ? 1.34 : 1;
  const reuseFactor = state.reuseActive ? 0.7 : 1;
  const sectorsNow = {};
  let total = 0;
  let solidsLoad = 0;

  for (const sector of sectors) {
    const profile = sectorProfiles[sector];
    const wave = Math.sin((state.tick + sectors.indexOf(sector) * 2) / 5) * profile.volatility;
    const spike = Math.random() < 0.08 ? rand(220, sector === "Rejeitos" ? 720 : 470) : 0;
    const dip = Math.random() < 0.05 ? rand(80, 210) : 0;
    const value = Math.max(90, (profile.base + wave + rand(-profile.volatility, profile.volatility) + spike - dip) * boost * reuseFactor);
    sectorsNow[sector] = round(value);
    total += value;
    solidsLoad += (value / 1000) * profile.solids;
    const threshold = profile.base * boost * reuseFactor * 1.43;
    if (value > threshold) createAlert(sector, value, value > threshold * 1.22 ? "critica" : "alta");
  }

  const quality = simulateQuality(total, solidsLoad);
  if (quality.score < 70 || quality.turbidity > 85 || quality.ph < 6.4 || quality.ph > 8.3) {
    createAlert("Tratamento", quality.score, quality.score < 60 ? "critica" : "alta", "qualidade");
  }

  if (state.mode === "automatico" && (state.alerts.length || quality.status !== "adequada")) {
    adjustTreatment(quality.status !== "adequada" ? "queda prevista de qualidade" : "anomalia operacional");
    for (const alert of state.alerts.slice(0, 2)) {
      if (!alert.automaticAction) markAutomaticResponse(alert, "IA ajustou tratamento e reduziu vazao");
    }
    total *= 0.9;
  }

  for (const alert of state.alerts.filter((item) => item.autoResolveAt && Date.now() > item.autoResolveAt)) {
    resolveAlert(alert.id, true);
  }

  const baselineTotal = sectors.reduce((sum, sector) => sum + sectorProfiles[sector].base, 0);
  const savedThisMinute = Math.max(0, baselineTotal - total + (quality.reuseReady ? 140 : 0));
  state.waterSaved += savedThisMinute / 30;
  state.co2Avoided = state.waterSaved * 0.00042;

  const risk = quality.status === "critica" ? "alto" : quality.status === "atencao" ? "medio" : riskFromTotal(total);
  const efficiency = Math.min(98, Math.max(48, 88 - (total - 1900) / 48 + (state.reuseActive ? 5 : 0) + (quality.reuseReady ? 6 : -5)));
  state.current = {
    sectors: sectorsNow,
    total: round(total),
    dailyTotal: round(state.current.dailyTotal + total / 30),
    efficiency: round(efficiency, 1),
    savingsBRL: round(state.waterSaved * 0.018, 2),
    risk,
    quality
  };

  state.history.push({ time: new Date().toLocaleTimeString("pt-BR"), total: state.current.total, sectors: sectorsNow, risk });
  state.qualityHistory.push({ time: new Date().toLocaleTimeString("pt-BR"), score: quality.score, ph: quality.ph, turbidity: quality.turbidity, tss: quality.tss });
  state.history = state.history.slice(-80);
  state.qualityHistory = state.qualityHistory.slice(-80);
}

function getEsg() {
  const qualityBonus = (state.current.quality.score || 75) * 0.16;
  const index = Math.max(0, Math.min(100, state.current.efficiency * 0.5 + qualityBonus + (state.reuseActive ? 16 : 2) - state.alerts.length * 3));
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
    treatment: {
      chemicalDose: round(state.treatment.chemicalDose, 1),
      flowRate: round(state.treatment.flowRate, 1),
      retentionTime: round(state.treatment.retentionTime, 1),
      autoAdjustments: state.treatment.autoAdjustments,
      lastAction: state.treatment.lastAction
    },
    dataIslands: getDataIslands(),
    reuseActive: state.reuseActive,
    mode: state.mode,
    alerts: state.alerts,
    notifications: state.notifications,
    history: state.history,
    qualityHistory: state.qualityHistory,
    esg: getEsg(),
    prediction: runPrediction()
  });
});

app.post("/api/reuse", (req, res) => {
  state.reuseActive = Boolean(req.body.active);
  pushNotification(state.reuseActive ? "Sistema de reuso ativo - qualidade monitorada para reutilizacao" : "Sistema de reuso desativado", state.reuseActive ? "success" : "warning");
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
  pushNotification("Analise preditiva de qualidade concluida", prediction.risk === "alto" ? "warning" : "success");
  res.json(prediction);
});

app.post("/api/treatment/adjust", (req, res) => {
  adjustTreatment("comando do operador");
  simulateTick();
  res.json({ ok: true, treatment: state.treatment });
});

app.post("/api/digital-twin/demand", (req, res) => {
  state.demandBoostUntil = Date.now() + 18000;
  state.qualityStressUntil = Date.now() + 18000;
  pushNotification("Digital Twin simulou aumento de demanda e piora de qualidade na entrada", "warning");
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
    treatment: state.treatment,
    dataIslands: getDataIslands(),
    esg: getEsg(),
    alertsOpen: state.alerts.length,
    prediction: runPrediction(),
    summary: "AquaMine integrou ilhas de dados, avaliou qualidade da agua e ajustou parametros de tratamento para manter o reuso no processo."
  };
  state.esgReports.unshift(report);
  res.json(report);
});

app.use(express.static(path.join(__dirname, "frontend")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "index.html"));
});

app.listen(port, () => {
  console.log(`AquaMine rodando em http://localhost:${port}`);
});
