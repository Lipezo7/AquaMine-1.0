const { useEffect, useState, useRef } = React;

function h(type, props, ...children) {
  return React.createElement(type, props, ...children.flat());
}

function App() {
  const [data, setData] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [report, setReport] = useState(null);
  const [loadingPredict, setLoadingPredict] = useState(false);
  const [lastAlertCount, setLastAlertCount] = useState(0);

  async function fetchState() {
    const response = await fetch("/api/state");
    const next = await response.json();
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
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    await fetchState();
    return response.json();
  }

  async function resolveAlert(id) {
    await fetch(`/api/alerts/${id}`, { method: "DELETE" });
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

React.render(h(App), document.getElementById("root"));
