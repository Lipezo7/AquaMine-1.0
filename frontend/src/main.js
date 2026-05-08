const { useEffect, useState, useRef } = React;

function h(type, props, ...children) {
  return React.createElement(type, props, ...children.flat());
}

const browserSimulator = createBrowserSimulator();

async function apiRequest(url, options = {}) {
  try {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`API ${response.status}`);
    return response.json();
  } catch {
    return browserSimulator.handle(url, options);
  }
}

function App() {
  const [data, setData] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [report, setReport] = useState(null);
  const [loadingPredict, setLoadingPredict] = useState(false);
  const [lastAlertCount, setLastAlertCount] = useState(0);

  async function fetchState() {
    const next = await apiRequest("/api/state");
    setData(next);
    if (!prediction) setPrediction(next.prediction);
    if (next.alerts.length > lastAlertCount) {
      document.getElementById("alertSound")?.play().catch(() => {});
    }
    setLastAlertCount(next.alerts.length);
  }

  useEffect(() => {
    fetchState();
    const timer = setInterval(fetchState, 2000);
    return () => clearInterval(timer);
  }, [lastAlertCount, prediction]);

  async function post(url, body = {}) {
    const result = await apiRequest(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    await fetchState();
    return result;
  }

  async function resolveAlert(id) {
    await apiRequest(`/api/alerts/${id}`, { method: "DELETE" });
    await fetchState();
  }

  async function runPredict() {
    setLoadingPredict(true);
    const result = await post("/api/predict");
    setPrediction(result);
    setTimeout(() => setLoadingPredict(false), 450);
  }

  async function generateReport() {
    const result = await post("/api/esg/report");
    setReport(result);
  }

  if (!data) return h("main", { className: "boot" }, h("div", { className: "spinner" }), h("p", null, "Inicializando AquaMine..."));

  return h(
    "main",
    { className: "shell" },
    h(Header, { data }),
    h(NotificationBar, { notifications: data.notifications }),
    h(
      "section",
      { className: "grid metrics" },
      h(MetricCard, { label: "Consumo atual", value: data.metrics.total, unit: "L/min", tone: riskTone(data.metrics.risk) }),
      h(MetricCard, { label: "Qualidade da agua", value: data.metrics.quality.score, unit: "/100", tone: qualityTone(data.metrics.quality.status) }),
      h(MetricCard, { label: "Pronta para reuso", value: data.metrics.quality.reuseReady ? "Sim" : "Nao", unit: "", tone: data.metrics.quality.reuseReady ? "green" : "yellow" }),
      h(MetricCard, { label: "Eficiencia hidrica", value: data.metrics.efficiency, unit: "%", tone: "green" }),
      h(MetricCard, { label: "Nivel de risco", value: riskLabel(data.metrics.risk), unit: "", tone: riskTone(data.metrics.risk) })
    ),
    h("section", { className: "content-grid" }, h(RealtimeChart, { history: data.history }), h(PredictivePanel, { prediction, loadingPredict, onRun: runPredict })),
    h("section", { className: "content-grid" }, h(QualityPanel, { quality: data.metrics.quality, history: data.qualityHistory }), h(TreatmentPanel, { treatment: data.treatment, onAdjust: () => post("/api/treatment/adjust") })),
    h(
      "section",
      { className: "content-grid" },
      h(ControlPanel, { data, onReuse: (active) => post("/api/reuse", { active }), onMode: (mode) => post("/api/mode", { mode }), onDemand: () => post("/api/digital-twin/demand") }),
      h(AlertsPanel, { alerts: data.alerts, mode: data.mode, onResolve: resolveAlert })
    ),
    h("section", { className: "content-grid wide-right" }, h(DataIslandsPanel, { islands: data.dataIslands }), h(EsgPanel, { esg: data.esg, onReport: generateReport })),
    h("section", { className: "content-grid wide-right" }, h(SectorsPanel, { sectors: data.metrics.sectors }), h(ProcessSummaryPanel, { data })),
    report ? h(ReportModal, { report, onClose: () => setReport(null) }) : null
  );
}

function Header({ data }) {
  return h(
    "header",
    { className: "hero" },
    h(
      "div",
      null,
      h("p", { className: "eyebrow" }, "Gestao inteligente da agua na mineracao"),
      h("h1", null, "AquaMine"),
      h("p", null, "Sistema que integra ilhas de dados, aprende o comportamento da agua no processo e atua automaticamente no tratamento para elevar reuso e reduzir desperdicios.")
    ),
    h("div", { className: `status ${data.esg.status.toLowerCase()}` }, h("span", null, "Status ESG"), h("strong", null, data.esg.status), h("small", null, `${data.alerts.length} alertas abertos`))
  );
}

function NotificationBar({ notifications }) {
  return h("section", { className: "notifications" }, notifications.slice(0, 3).map((item) => h("div", { key: item.id, className: `notice ${item.type}` }, h("span", null, item.time), h("strong", null, item.message))));
}

function MetricCard({ label, value, unit, tone }) {
  return h("article", { className: `card metric ${tone}` }, h("span", null, label), h("strong", null, formatNumber(value), unit ? h("small", null, ` ${unit}`) : null), h("div", { className: "pulse-line" }));
}

function RealtimeChart({ history }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  useEffect(() => {
    const labels = history.slice(-34).map((item) => item.time);
    const values = history.slice(-34).map((item) => item.total);
    if (!chartRef.current || chartRef.current.canvas !== canvasRef.current) {
      chartRef.current = new Chart(canvasRef.current, { type: "line", data: { labels, datasets: [{ data: values }] }, options: { responsive: true } });
    } else {
      chartRef.current.data.labels = labels;
      chartRef.current.data.datasets[0].data = values;
      chartRef.current.update();
    }
  }, [history]);
  return h("article", { className: "panel chart-panel" }, h("div", { className: "panel-head" }, h("div", null, h("span", null, "Tempo real"), h("h2", null, "Consumo operacional"))), h("canvas", { ref: canvasRef }));
}

function PredictivePanel({ prediction, loadingPredict, onRun }) {
  return h(
    "article",
    { className: "panel ai-panel" },
    h("div", { className: "panel-head" }, h("div", null, h("span", null, "Aprendizado preditivo"), h("h2", null, "Previsao de qualidade"))),
    h("div", { className: "ai-core" }, loadingPredict ? h("div", { className: "spinner small" }) : h("strong", null, `${formatNumber(prediction?.predictedQuality || 0)}/100`), h("span", null, "Qualidade prevista nas proximas 2h")),
    h("p", { className: `risk-text ${riskTone(prediction?.risk || "baixo")}` }, `Risco de desperdicio: ${prediction?.wasteRisk || "Baixo"}`),
    h("p", { className: "muted" }, `Consumo previsto: ${formatNumber(prediction?.predictedConsumption || 0)} L/min`),
    h("p", { className: "muted" }, prediction?.recommendation || ""),
    h("button", { className: "primary", onClick: onRun }, "Rodar analise preditiva")
  );
}

function QualityPanel({ quality, history }) {
  const last = history.slice(-1)[0] || quality;
  return h(
    "article",
    { className: `panel quality ${quality.status}` },
    h("div", { className: "panel-head" }, h("div", null, h("span", null, "Sensores de qualidade"), h("h2", null, "Agua para reutilizacao"))),
    h("div", { className: "quality-grid" },
      h(QualityItem, { label: "pH", value: quality.ph, target: "6,5 a 8,2" }),
      h(QualityItem, { label: "Turbidez", value: `${quality.turbidity} NTU`, target: "< 75" }),
      h(QualityItem, { label: "Solidos totais", value: `${quality.tss} mg/L`, target: "estavel" }),
      h(QualityItem, { label: "Condutividade", value: `${quality.conductivity} uS/cm`, target: "monitorada" })
    ),
    h("p", { className: `risk-text ${qualityTone(quality.status)}` }, `Status: ${qualityLabel(quality.status)}`),
    h("p", { className: "muted" }, `Ultima leitura integrada: ${last.time || "agora"}`)
  );
}

function QualityItem({ label, value, target }) {
  return h("div", { className: "quality-item" }, h("span", null, label), h("strong", null, value), h("small", null, target));
}

function TreatmentPanel({ treatment, onAdjust }) {
  return h(
    "article",
    { className: "panel treatment-panel" },
    h("div", { className: "panel-head" }, h("div", null, h("span", null, "Atuacao no processo"), h("h2", null, "Tratamento automatico"))),
    h("div", { className: "treatment-bars" },
      h(Bar, { label: "Dosagem quimica", value: treatment.chemicalDose, max: 80, unit: "%" }),
      h(Bar, { label: "Vazao de tratamento", value: treatment.flowRate, max: 100, unit: "%" }),
      h(Bar, { label: "Tempo de retencao", value: treatment.retentionTime, max: 80, unit: "min" })
    ),
    h("p", { className: "success-text" }, treatment.lastAction),
    h("p", { className: "muted" }, `${treatment.autoAdjustments} ajustes automaticos registrados nesta simulacao.`),
    h("button", { className: "primary", onClick: onAdjust }, "Ajustar tratamento agora")
  );
}

function Bar({ label, value, max, unit }) {
  return h("div", { className: "bar-row" }, h("div", null, h("strong", null, label), h("span", null, `${formatNumber(value)} ${unit}`)), h("meter", { value, min: 0, max }));
}

function ControlPanel({ data, onReuse, onMode, onDemand }) {
  return h(
    "article",
    { className: "panel controls sim-panel" },
    h(
      "div",
      { className: "panel-head sim-head" },
      h("div", null, h("span", null, "Centro de controle inteligente"), h("h2", null, "Simulacao Operacional")),
      h("div", { className: `sim-live ${data.metrics.quality.reuseReady ? "ok" : "watch"}` }, h("i", null), h("strong", null, data.metrics.quality.reuseReady ? "Reuso liberado" : "Ajustando qualidade"))
    ),
    h(SimulationCore, { data }),
    h("div", { className: "control-actions" },
      h("div", { className: "control-row" }, h("button", { className: data.reuseActive ? "success" : "", onClick: () => onReuse(true) }, "Ativar reuso"), h("button", { onClick: () => onReuse(false) }, "Desativar reuso")),
      h("div", { className: "segmented" }, h("button", { className: data.mode === "automatico" ? "active" : "", onClick: () => onMode("automatico") }, "Modo automatico"), h("button", { className: data.mode === "manual" ? "active" : "", onClick: () => onMode("manual") }, "Modo manual")),
      h("button", { className: "danger", onClick: onDemand }, "Simular queda de qualidade")
    ),
    data.reuseActive ? h("p", { className: "success-text" }, "Reuso ativo com qualidade monitorada antes de retornar ao processo.") : h("p", { className: "muted" }, "Reuso desativado. O sistema continua monitorando consumo e qualidade.")
  );
}

function SimulationCore({ data }) {
  const quality = data.metrics.quality;
  const logs = getSimulationLogs(data);
  const steps = [
    { name: "Captacao", icon: "cap", status: "agua entrando", value: `${formatNumber(data.metrics.total)} L/min`, tone: data.metrics.risk },
    { name: "Processo", icon: "proc", status: "operacao monitorada", value: `${formatNumber(data.metrics.efficiency)}% eficiente`, tone: "baixo" },
    { name: "Tratamento", icon: "treat", status: quality.status === "adequada" ? "agua estabilizada" : "corrigindo qualidade", value: `${formatNumber(quality.score)}/100`, tone: quality.status === "critica" ? "alto" : quality.status === "atencao" ? "medio" : "baixo" },
    { name: "Reuso", icon: "reuse", status: quality.reuseReady ? "liberado" : "em ajuste", value: quality.reuseReady ? "retorno ativo" : "aguardando", tone: quality.reuseReady ? "baixo" : "medio" }
  ];
  return h(
    "div",
    { className: "sim-core" },
    h(
      "div",
      { className: "sim-stage" },
      h("div", { className: "water-stream stream-in" }),
      h("div", { className: "water-stream stream-return" }),
      h("div", { className: "sim-flow" }, steps.map((step, index) => h(SimulationStep, { step, index, key: step.name })))
    ),
    h(
      "div",
      { className: "sim-metrics" },
      h(SimMetric, { label: "Vazao atual", value: `${formatNumber(data.metrics.total)} L/min` }),
      h(SimMetric, { label: "Qualidade", value: `${formatNumber(quality.score)}/100` }),
      h(SimMetric, { label: "Status do reuso", value: quality.reuseReady ? "Liberado" : "Em ajuste" }),
      h(SimMetric, { label: "Eficiencia", value: `${formatNumber(data.metrics.efficiency)}%` })
    ),
    h(
      "div",
      { className: "sim-bottom" },
      h("div", { className: "treatment-visual" }, h("span", null, "Entrada"), h("div", { className: "treatment-tank" }, h("i", null), h("b", null), h("em", null)), h("span", null, "Agua reutilizada")),
      h("div", { className: "ai-log" }, h("strong", null, "Logs inteligentes"), logs.map((log) => h("p", { key: log.text, className: log.tone }, h("span", null, log.time), log.text)))
    )
  );
}

function ProcessSummaryPanel({ data }) {
  return h(
    "article",
    { className: "panel actuation" },
    h("div", { className: "panel-head" }, h("div", null, h("span", null, "Resumo do processo"), h("h2", null, "Da entrada ao reuso"))),
    h("div", { className: "flow-steps" },
      h("div", null, h("strong", null, "Captacao"), h("span", null, "sensores conectados")),
      h("div", null, h("strong", null, "Processo"), h("span", null, "consumo monitorado")),
      h("div", null, h("strong", null, "Tratamento"), h("span", null, "ajuste em tempo real")),
      h("div", null, h("strong", null, "Reuso"), h("span", null, data.metrics.quality.reuseReady ? "liberado" : "em ajuste"))
    ),
    h("p", { className: "muted" }, "A simulação operacional principal agora fica no bloco de controle, no lugar do antigo espaco vazio.")
  );
}

function AlertsPanel({ alerts, mode, onResolve }) {
  return h(
    "article",
    { className: "panel alerts-panel" },
    h("div", { className: "panel-head" }, h("div", null, h("span", null, "Alertas inteligentes"), h("h2", null, mode === "automatico" ? "Resposta automatica" : "Fila operacional"))),
    alerts.length
      ? h("div", { className: "alert-list" }, alerts.map((alert) => h("div", { key: alert.id, className: `alert ${alert.severity} ${alert.status}` }, h("div", null, h("strong", null, alert.sector), h("span", null, `${alert.time} - ${alert.kind} - ${alert.value} - ${alert.severity}`), alert.automaticAction ? h("small", { className: "auto-action" }, alert.automaticAction) : null), alert.status === "em_contencao" ? h("b", { className: "auto-badge" }, "IA atuando") : h("button", { onClick: () => onResolve(alert.id) }, "Resolver alerta"))))
      : h("div", { className: "empty" }, "Nenhum alerta ativo. Qualidade e consumo dentro do padrao.")
  );
}

function DataIslandsPanel({ islands }) {
  return h(
    "article",
    { className: "panel" },
    h("div", { className: "panel-head" }, h("div", null, h("span", null, "Integracao de ilhas de dados"), h("h2", null, "Fontes centralizadas"))),
    h("div", { className: "island-list" }, islands.map((island) => h("div", { key: island.name, className: `island ${island.status}` }, h("div", null, h("strong", null, island.name), h("span", null, island.source), h("small", null, island.freshness)), h("b", null, `${island.confidence}%`))))
  );
}

function SectorsPanel({ sectors }) {
  const max = Math.max(...Object.values(sectors), 1);
  return h("article", { className: "panel" }, h("div", { className: "panel-head" }, h("div", null, h("span", null, "Etapas da mineracao"), h("h2", null, "Consumo por setor"))), h("div", { className: "sector-list" }, Object.entries(sectors).map(([name, value]) => h("div", { key: name, className: "sector" }, h("div", null, h("strong", null, name), h("span", null, `${formatNumber(value)} L/min`)), h("meter", { value, min: 0, max })))));
}

function EsgPanel({ esg, onReport }) {
  return h("article", { className: `panel esg ${esg.status.toLowerCase()}` }, h("div", { className: "panel-head" }, h("div", null, h("span", null, "Dashboard ESG completo"), h("h2", null, "Impacto sustentavel"))), h("div", { className: "esg-grid" }, h("div", null, h("span", null, "Agua economizada"), h("strong", null, `${formatNumber(esg.waterSaved)} L`)), h("div", null, h("span", null, "CO2 evitado"), h("strong", null, `${formatNumber(esg.co2Avoided)} t`)), h("div", null, h("span", null, "Indice ESG"), h("strong", null, `${esg.index}/100`)), h("div", null, h("span", null, "Status"), h("strong", null, esg.status))), h("button", { className: "primary", onClick: onReport }, "Gerar relatorio ESG"));
}

function SimulationStep({ step, index }) {
  return h(
    "div",
    { className: `sim-step ${riskTone(step.tone)}` },
    h("div", { className: `step-icon ${step.icon}` }, h("i", null), h("b", null)),
    h("strong", null, step.name),
    h("span", null, step.status),
    h("small", null, step.value),
    index < 3 ? h("div", { className: "flow-connector" }, h("i", null)) : null
  );
}

function SimMetric({ label, value }) {
  return h("div", { className: "sim-metric" }, h("span", null, label), h("strong", null, value));
}

function getSimulationLogs(data) {
  const quality = data.metrics.quality;
  const now = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const logs = [];
  if (data.mode === "automatico") logs.push({ time: now, text: "IA ajustando retencao", tone: "success" });
  if (quality.turbidity > 75 || quality.status !== "adequada") logs.push({ time: now, text: "Turbidez elevada detectada", tone: "warning" });
  if (quality.reuseReady) logs.push({ time: now, text: "Reuso liberado", tone: "success" });
  if (data.prediction?.predictedQuality < quality.score - 2 || data.prediction?.risk === "alto") logs.push({ time: now, text: "Predicao de queda de qualidade", tone: "warning" });
  logs.push({ time: now, text: `Tratamento em ${formatNumber(data.treatment.retentionTime)} min`, tone: "info" });
  logs.push({ time: now, text: "Fluxo operacional monitorado", tone: "info" });
  return logs.slice(0, 5);
}

function ReportModal({ report, onClose }) {
  return h("div", { className: "modal-backdrop" }, h("section", { className: "modal" }, h("div", { className: "panel-head" }, h("div", null, h("span", null, report.createdAt), h("h2", null, "Relatorio ESG AquaMine")), h("button", { onClick: onClose }, "Fechar")), h("div", { className: "report-grid" }, h("p", null, report.summary), h("p", null, `Consumo atual: ${formatNumber(report.metrics.total)} L/min`), h("p", null, `Qualidade da agua: ${formatNumber(report.metrics.quality.score)}/100`), h("p", null, `pH: ${report.metrics.quality.ph} | Turbidez: ${report.metrics.quality.turbidity} NTU`), h("p", null, `Dosagem quimica: ${formatNumber(report.treatment.chemicalDose)}%`), h("p", null, `Agua economizada: ${formatNumber(report.esg.waterSaved)} L`), h("p", null, `Indice ESG: ${report.esg.index}/100 (${report.esg.status})`), h("p", null, `Previsao: ${report.prediction.recommendation}`)), h("button", { className: "primary", onClick: () => window.print() }, "Exportar relatorio em PDF")));
}

function riskTone(risk) {
  return risk === "alto" ? "red" : risk === "medio" ? "yellow" : "green";
}

function qualityTone(status) {
  return status === "critica" ? "red" : status === "atencao" ? "yellow" : "green";
}

function riskLabel(risk) {
  return risk === "alto" ? "Alto" : risk === "medio" ? "Medio" : "Baixo";
}

function qualityLabel(status) {
  return status === "critica" ? "Critica" : status === "atencao" ? "Atencao" : "Adequada";
}

function formatNumber(value) {
  if (typeof value === "string") return value;
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value);
}

function createBrowserSimulator() {
  const sectors = ["Britagem", "Processamento", "Rejeitos", "Transporte"];
  const profiles = {
    Britagem: { base: 620, volatility: 95, solids: 7 },
    Processamento: { base: 880, volatility: 130, solids: 10 },
    Rejeitos: { base: 540, volatility: 170, solids: 18 },
    Transporte: { base: 330, volatility: 65, solids: 4 }
  };
  const state = {
    reuseActive: false,
    mode: "manual",
    tick: 0,
    waterSaved: 0,
    alerts: [],
    notifications: [],
    history: [],
    qualityHistory: [],
    demandUntil: 0,
    qualityUntil: 0,
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

  function notify(message, type = "info") {
    state.notifications.unshift({ id: crypto.randomUUID(), message, type, time: new Date().toLocaleTimeString("pt-BR") });
    state.notifications = state.notifications.slice(0, 6);
  }

  function createAlert(sector, value, severity, kind = "consumo") {
    const existing = state.alerts.find((alert) => alert.sector === sector && alert.kind === kind);
    if (existing) return;
    state.alerts.unshift({
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      sector,
      time: new Date().toLocaleTimeString("pt-BR"),
      severity,
      value: round(value, kind === "qualidade" ? 1 : 0),
      kind,
      status: state.mode === "automatico" ? "em_contencao" : "aberto",
      automaticAction: state.mode === "automatico" ? "IA ajustou tratamento e reduziu vazao" : null
    });
    notify(`Alerta ${severity} em ${sector.toLowerCase()}`, severity === "critica" ? "critical" : "warning");
  }

  function adjustTreatment(reason = "controle automatico") {
    state.treatment.chemicalDose = Math.min(72, state.treatment.chemicalDose + rand(3, 7));
    state.treatment.flowRate = Math.max(48, state.treatment.flowRate - rand(3, 7));
    state.treatment.retentionTime = Math.min(72, state.treatment.retentionTime + rand(3, 6));
    state.treatment.autoAdjustments += 1;
    state.treatment.lastAction = `Ajuste automatico por ${reason}: dosagem elevada, vazao reduzida e retencao ampliada.`;
    notify("Tratamento ajustado automaticamente para preservar qualidade de reuso", "success");
  }

  function simulateQuality(total, solidsLoad) {
    const stress = Date.now() < state.qualityUntil ? 1 : 0;
    const treatmentEffect = (state.treatment.chemicalDose - 34) * 0.32 + (state.treatment.retentionTime - 38) * 0.2 - (state.treatment.flowRate - 70) * 0.11;
    const loadPenalty = solidsLoad * 0.42 + (total > 2800 ? (total - 2800) / 85 : 0) + stress * rand(8, 16);
    const score = Math.max(38, Math.min(98, 88 + treatmentEffect - loadPenalty + rand(-3, 3)));
    const ph = Math.max(5.9, Math.min(8.8, 7.25 - stress * 0.35 - solidsLoad / 120 + treatmentEffect / 70 + rand(-0.08, 0.08)));
    const turbidity = Math.max(8, 22 + solidsLoad * 1.9 + stress * rand(16, 30) - treatmentEffect * 1.1 + rand(-4, 5));
    return {
      score: round(score, 1),
      status: qualityStatus(score),
      ph: round(ph, 2),
      turbidity: round(turbidity, 1),
      tss: round(Math.max(60, 130 + solidsLoad * 5.8 + stress * 90 - treatmentEffect * 3 + rand(-14, 18))),
      conductivity: round(Math.max(380, 760 + solidsLoad * 7 + stress * 120 + rand(-35, 45))),
      reuseReady: score >= 76 && ph >= 6.5 && ph <= 8.2 && turbidity < 75
    };
  }

  function tick() {
    state.tick += 1;
    const boost = Date.now() < state.demandUntil ? 1.34 : 1;
    const reuseFactor = state.reuseActive ? 0.7 : 1;
    const sectorsNow = {};
    let total = 0;
    let solidsLoad = 0;
    for (const sector of sectors) {
      const profile = profiles[sector];
      const wave = Math.sin((state.tick + sectors.indexOf(sector) * 2) / 5) * profile.volatility;
      const spike = Math.random() < 0.09 ? rand(220, sector === "Rejeitos" ? 720 : 470) : 0;
      const value = Math.max(90, (profile.base + wave + rand(-profile.volatility, profile.volatility) + spike) * boost * reuseFactor);
      sectorsNow[sector] = round(value);
      total += value;
      solidsLoad += (value / 1000) * profile.solids;
      if (value > profile.base * boost * reuseFactor * 1.45) createAlert(sector, value, "alta");
    }
    const quality = simulateQuality(total, solidsLoad);
    if (quality.score < 70 || quality.turbidity > 85) createAlert("Tratamento", quality.score, quality.score < 60 ? "critica" : "alta", "qualidade");
    if (state.mode === "automatico" && (state.alerts.length || quality.status !== "adequada")) {
      adjustTreatment(quality.status !== "adequada" ? "queda prevista de qualidade" : "anomalia operacional");
      total *= 0.9;
    }
    state.alerts = state.alerts.filter((alert) => Date.now() - alert.createdAt < 18000 || alert.status === "aberto");
    const baseline = sectors.reduce((sum, sector) => sum + profiles[sector].base, 0);
    state.waterSaved += Math.max(0, baseline - total + (quality.reuseReady ? 140 : 0)) / 30;
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
    const time = new Date().toLocaleTimeString("pt-BR");
    state.history.push({ time, total: state.current.total, sectors: sectorsNow, risk });
    state.qualityHistory.push({ time, score: quality.score, ph: quality.ph, turbidity: quality.turbidity, tss: quality.tss });
    state.history = state.history.slice(-80);
    state.qualityHistory = state.qualityHistory.slice(-80);
  }

  function prediction() {
    const recent = state.qualityHistory.slice(-12);
    const avg = recent.reduce((sum, item) => sum + item.score, 0) / Math.max(1, recent.length);
    const predictedQuality = Math.max(35, Math.min(98, avg + rand(-3, 3)));
    const predictedConsumption = Math.max(0, state.current.total + rand(-120, 180));
    const risk = predictedQuality < 62 || predictedConsumption > 3100 ? "alto" : predictedQuality < 76 || predictedConsumption > 2450 ? "medio" : "baixo";
    return {
      predictedConsumption: round(predictedConsumption),
      predictedQuality: round(predictedQuality, 1),
      wasteRisk: risk === "alto" ? "Alto" : risk === "medio" ? "Medio" : "Baixo",
      qualityRisk: qualityStatus(predictedQuality),
      risk,
      confidence: round(rand(84, 96), 1),
      recommendation: risk === "alto" ? "Aumentar dosagem, reduzir vazao e elevar retencao antes do reuso." : risk === "medio" ? "Acompanhar turbidez e ajustar vazao preventivamente." : "Qualidade e consumo estaveis para manter reuso no processo."
    };
  }

  function dataIslands() {
    return [
      { name: "Sensores de qualidade", source: "pH, turbidez, TSS e condutividade", freshness: "tempo real", status: state.current.quality.score < 70 ? "atencao" : "integrado", confidence: round(Math.max(71, state.current.quality.score || 82)) },
      { name: "Etapas do processo", source: "britagem, processamento, rejeitos e transporte", freshness: "tempo real", status: "integrado", confidence: 94 },
      { name: "Tratamento de agua", source: "dosagem, vazao e tempo de retencao", freshness: "tempo real", status: state.treatment.autoAdjustments > 0 ? "atuando" : "integrado", confidence: 91 },
      { name: "Historico operacional", source: `${state.history.length} leituras recentes em memoria`, freshness: "aprendizado continuo", status: "integrado", confidence: 88 }
    ];
  }

  function snapshot() {
    tick();
    const qualityBonus = (state.current.quality.score || 75) * 0.16;
    const esgIndex = Math.max(0, Math.min(100, state.current.efficiency * 0.5 + qualityBonus + (state.reuseActive ? 16 : 2) - state.alerts.length * 3));
    return {
      metrics: state.current,
      treatment: { ...state.treatment, chemicalDose: round(state.treatment.chemicalDose, 1), flowRate: round(state.treatment.flowRate, 1), retentionTime: round(state.treatment.retentionTime, 1) },
      dataIslands: dataIslands(),
      reuseActive: state.reuseActive,
      mode: state.mode,
      alerts: state.alerts,
      notifications: state.notifications,
      history: state.history,
      qualityHistory: state.qualityHistory,
      esg: { waterSaved: round(state.waterSaved), co2Avoided: round(state.waterSaved * 0.00042, 2), index: round(esgIndex), status: esgIndex >= 78 ? "Verde" : esgIndex >= 58 ? "Amarelo" : "Vermelho" },
      prediction: prediction()
    };
  }

  for (let i = 0; i < 18; i += 1) tick();

  return {
    handle(url, options = {}) {
      const method = options.method || "GET";
      const body = options.body ? JSON.parse(options.body) : {};
      if (url === "/api/state") return snapshot();
      if (url === "/api/reuse") {
        state.reuseActive = Boolean(body.active);
        notify(state.reuseActive ? "Sistema de reuso ativo - qualidade monitorada para reutilizacao" : "Sistema de reuso desativado", state.reuseActive ? "success" : "warning");
        return { ok: true, reuseActive: state.reuseActive };
      }
      if (url === "/api/mode") {
        state.mode = body.mode === "automatico" ? "automatico" : "manual";
        notify(`Modo ${state.mode} ativado`, "info");
        return { ok: true, mode: state.mode };
      }
      if (url === "/api/predict") return prediction();
      if (url === "/api/treatment/adjust") {
        adjustTreatment("comando do operador");
        return { ok: true, treatment: state.treatment };
      }
      if (url === "/api/digital-twin/demand") {
        state.demandUntil = Date.now() + 18000;
        state.qualityUntil = Date.now() + 18000;
        notify("Simulacao do processo elevou demanda e piorou qualidade na entrada", "warning");
        return { ok: true };
      }
      if (method === "DELETE" && url.startsWith("/api/alerts/")) {
        const id = url.split("/").pop();
        state.alerts = state.alerts.filter((alert) => alert.id !== id);
        notify("Operador resolveu alerta", "success");
        return { ok: true };
      }
      if (url === "/api/esg/report") {
        const current = snapshot();
        return {
          id: crypto.randomUUID(),
          createdAt: new Date().toLocaleString("pt-BR"),
          metrics: current.metrics,
          treatment: current.treatment,
          dataIslands: current.dataIslands,
          esg: current.esg,
          alertsOpen: current.alerts.length,
          prediction: current.prediction,
          summary: "AquaMine integrou ilhas de dados, avaliou qualidade da agua e ajustou parametros de tratamento para manter o reuso no processo."
        };
      }
      return snapshot();
    }
  };
}

React.render(h(App), document.getElementById("root"));
