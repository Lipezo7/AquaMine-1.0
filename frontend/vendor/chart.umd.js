window.Chart = class MiniLineChart {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.data = config.data;
    this.options = config.options || {};
    this.update();
  }

  update() {
    const ctx = this.ctx;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, rect.width * dpr);
    this.canvas.height = Math.max(1, rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const width = rect.width;
    const height = rect.height;
    const pad = 28;
    const values = this.data.datasets[0].data;
    const labels = this.data.labels;
    const max = Math.max(...values, 3200);
    const min = Math.min(...values, 0);
    ctx.clearRect(0, 0, width, height);
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "rgba(27, 186, 255, 0.24)");
    gradient.addColorStop(1, "rgba(42, 217, 143, 0.02)");
    ctx.fillStyle = "#07131f";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.16)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i += 1) {
      const y = pad + ((height - pad * 2) / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(width - pad, y);
      ctx.stroke();
    }
    if (values.length < 2) return;
    const points = values.map((value, index) => ({
      x: pad + ((width - pad * 2) / (values.length - 1)) * index,
      y: height - pad - ((value - min) / Math.max(1, max - min)) * (height - pad * 2)
    }));
    ctx.beginPath();
    points.forEach((point, index) => (index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)));
    ctx.lineTo(points.at(-1).x, height - pad);
    ctx.lineTo(points[0].x, height - pad);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.beginPath();
    points.forEach((point, index) => (index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)));
    ctx.strokeStyle = "#1bbaff";
    ctx.lineWidth = 3;
    ctx.shadowColor = "rgba(27, 186, 255, 0.45)";
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;
    const last = points.at(-1);
    ctx.fillStyle = "#2ad98f";
    ctx.beginPath();
    ctx.arc(last.x, last.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8aa4b8";
    ctx.font = "11px Inter, Arial";
    ctx.fillText(`${Math.round(max)} L/min`, pad, 16);
    ctx.fillText(labels.at(-1) || "", Math.max(pad, width - 92), height - 8);
  }

  destroy() {}
};
