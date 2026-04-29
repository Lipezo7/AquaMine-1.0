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

  if (!data) return h("main", { className: "boot" }, h("div", { className: "spinner" }), h("p", null, "Inicializando AquaMine AI..."));

  return h(
    "main",
    { className: "shell" },
    h(Header, { data }),
    h(NotificationBar, { notifications: data.notifications }),
    h(
      "section",
      { className: "grid metrics" },
      h(MetricCard, { label: "Consumo atual", value: data.metrics.total, unit: "L/min", tone: riskTone(data.metrics.risk) }),
      h(MetricCard, { label: "Consumo diario", value: data.metrics.dailyTotal, unit: "L", tone: "blue" }),
      h(MetricCard, { label: "Eficiencia hidrica", value: data.metrics.efficiency, unit: "%", tone: "green" }),
      h(MetricCard, { label: "Economia estimada", value: `R$ ${money(data.metrics.savingsBRL)}`, unit: "", tone: "green" }),
      h(MetricCard, { label: "Nivel de risco", value: riskLabel(data.metrics.risk), unit: "", tone: riskTone(data.metrics.risk) })
    ),
    h("section", { className: "content-grid" }, h(RealtimeChart, { history: data.history }), h(AiPanel, { prediction, loadingPredict, onRun: runPredict })),
    h(
      "section",
      { className: "content-grid" },
      h(ControlPanel, { data, onReuse: (active) => post("/api/reuse", { active }), onMode: (mode) => post("/api/mode", { mode }), onDemand: () => post("/api/digital-twin/demand") }),
      h(AlertsPanel, { alerts: data.alerts, mode: data.mode, onResolve: resolveAlert })
    ),
    h("section", { className: "content-grid wide-right" }, h(SectorsPanel, { sectors: data.metrics.sectors }), h(EsgPanel, { esg: data.esg, onReport: generateReport })),
    report ? h(ReportModal, { report, onClose: () => setReport(null) }) : null
  );
}

function Header({ data }) {
  return h(
    "header",
    { className: "hero" },
    h("div", null, h("p", { className: "eyebrow" }, "Plataforma industrial inteligente"), h("h1", null, "AquaMine AI"), h("p", null, "Gestao preditiva de agua para mineracao sustentavel, com automacao operacional e indicadores ESG em tempo real.")),
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
  return h("article", { className: "panel chart-panel" }, h("div", { className: "panel-head" }, h("div", null, h("span", null, "Grafico em tempo real"), h("h2", null, "Consumo operacional"))), h("canvas", { ref: canvasRef }));
}

function AiPanel({ prediction, loadingPredict, onRun }) {
  return h(
    "article",
    { className: "panel ai-panel" },
    h("div", { className: "panel-head" }, h("div", null, h("span", null, "Modulo de IA"), h("h2", null, "Analise preditiva"))),
    h("div", { className: "ai-core" }, loadingPredict ? h("div", { className: "spinner small" }) : h("strong", null, `${formatNumber(prediction?.predictedConsumption || 0)} L/min`), h("span", null, "Previsao de consumo nas proximas 2h")),
    h("p", { className: `risk-text ${riskTone(prediction?.risk || "baixo")}` }, `Risco de desperdicio: ${prediction?.wasteRisk || "Baixo"}`),
    h("p", { className: "muted" }, prediction?.recommendation || ""),
    h("button", { className: "primary", onClick: onRun }, "Rodar analise preditiva")
  );
}

function ControlPanel({ data, onReuse, onMode, onDemand }) {
  return h(
    "article",
    { className: "panel controls" },
    h("div", { className: "panel-head" }, h("div", null, h("span", null, "Automacao"), h("h2", null, "Controle da operacao"))),
    h("div", { className: "control-row" }, h("button", { className: data.reuseActive ? "success" : "", onClick: () => onReuse(true) }, "Ativar reuso"), h("button", { onClick: () => onReuse(false) }, "Desativar reuso")),
    data.reuseActive ? h("p", { className: "success-text" }, "Sistema de reuso ativo - economia otimizada") : h("p", { className: "muted" }, "Reuso desativado. Consumo segue a demanda bruta simulada."),
    h("div", { className: "segmented" }, h("button", { className: data.mode === "automatico" ? "active" : "", onClick: () => onMode("automatico") }, "Modo automatico"), h("button", { className: data.mode === "manual" ? "active" : "", onClick: () => onMode("manual") }, "Modo manual")),
    h("div", { className: "twin" }, h("span", null, "Digital Twin"), h("button", { className: "danger", onClick: onDemand }, "Simular aumento de demanda"))
  );
}

function AlertsPanel({ alerts, mode, onResolve }) {
  return h(
    "article",
    { className: "panel alerts-panel" },
    h("div", { className: "panel-head" }, h("div", null, h("span", null, "Alertas inteligentes"), h("h2", null, mode === "automatico" ? "Resposta automatica" : "Fila operacional"))),
    alerts.length
      ? h("div", { className: "alert-list" }, alerts.map((alert) => h("div", { key: alert.id, className: `alert ${alert.severity}` }, h("div", null, h("strong", null, alert.sector), h("span", null, `${alert.time} - ${alert.value} L/min - ${alert.severity}`)), h("button", { onClick: () => onResolve(alert.id) }, "Resolver alerta"))))
      : h("div", { className: "empty" }, "Nenhum alerta ativo. Operacao dentro do padrao.")
  );
}

function SectorsPanel({ sectors }) {
  const max = Math.max(...Object.values(sectors), 1);
  return h("article", { className: "panel" }, h("div", { className: "panel-head" }, h("div", null, h("span", null, "Setores da mineracao"), h("h2", null, "Consumo por setor"))), h("div", { className: "sector-list" }, Object.entries(sectors).map(([name, value]) => h("div", { key: name, className: "sector" }, h("div", null, h("strong", null, name), h("span", null, `${formatNumber(value)} L/min`)), h("meter", { value, min: 0, max })))));
}

function EsgPanel({ esg, onReport }) {
  return h("article", { className: `panel esg ${esg.status.toLowerCase()}` }, h("div", { className: "panel-head" }, h("div", null, h("span", null, "Dashboard ESG completo"), h("h2", null, "Impacto sustentavel"))), h("div", { className: "esg-grid" }, h("div", null, h("span", null, "Agua economizada"), h("strong", null, `${formatNumber(esg.waterSaved)} L`)), h("div", null, h("span", null, "CO2 evitado"), h("strong", null, `${formatNumber(esg.co2Avoided)} t`)), h("div", null, h("span", null, "Indice ESG"), h("strong", null, `${esg.index}/100`)), h("div", null, h("span", null, "Status"), h("strong", null, esg.status))), h("button", { className: "primary", onClick: onReport }, "Gerar relatorio ESG"));
}

function ReportModal({ report, onClose }) {
  return h("div", { className: "modal-backdrop" }, h("section", { className: "modal" }, h("div", { className: "panel-head" }, h("div", null, h("span", null, report.createdAt), h("h2", null, "Relatorio ESG AquaMine AI")), h("button", { onClick: onClose }, "Fechar")), h("div", { className: "report-grid" }, h("p", null, report.summary), h("p", null, `Consumo atual: ${formatNumber(report.metrics.total)} L/min`), h("p", null, `Eficiencia hidrica: ${report.metrics.efficiency}%`), h("p", null, `Agua economizada: ${formatNumber(report.esg.waterSaved)} L`), h("p", null, `CO2 evitado: ${formatNumber(report.esg.co2Avoided)} t`), h("p", null, `Indice ESG: ${report.esg.index}/100 (${report.esg.status})`), h("p", null, `Alertas abertos: ${report.alertsOpen}`), h("p", null, `IA: ${report.prediction.recommendation}`)), h("button", { className: "primary", onClick: () => window.print() }, "Exportar relatorio em PDF")));
}

function riskTone(risk) {
  return risk === "alto" ? "red" : risk === "medio" ? "yellow" : "green";
}

function riskLabel(risk) {
  return risk === "alto" ? "Alto" : risk === "medio" ? "Medio" : "Baixo";
}

function formatNumber(value) {
  if (typeof value === "string") return value;
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value);
}

function money(value) {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

React.render(h(App), document.getElementById("root"));
