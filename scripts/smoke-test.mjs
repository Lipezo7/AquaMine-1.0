import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const port = 3010;
const root = path.resolve(".");
const server = spawn(process.execPath, ["server.js"], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

const logs = [];
server.stdout.on("data", (chunk) => logs.push(chunk.toString()));
server.stderr.on("data", (chunk) => logs.push(chunk.toString()));

async function waitForServer() {
  for (let i = 0; i < 30; i += 1) {
    try {
      const response = await fetch(`http://localhost:${port}/api/state`);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Server did not respond. Logs:\n${logs.join("")}`);
}

try {
  await waitForServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(`http://localhost:${port}`, { waitUntil: "networkidle" });
  await page.getByText("AquaMine AI").waitFor();
  await page.getByRole("button", { name: "Rodar analise preditiva" }).click();
  await page.getByRole("button", { name: "Ativar reuso" }).click();
  await page.getByRole("button", { name: "Modo automatico" }).click();
  await page.getByRole("button", { name: "Simular aumento de demanda" }).click();
  await page.getByRole("button", { name: "Gerar relatorio ESG" }).click();
  await page.getByText("Relatorio ESG AquaMine AI").waitFor();
  const canvasIsNonBlank = await page.locator("canvas").evaluate((canvas) => {
    const ctx = canvas.getContext("2d");
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return data.some((channel, index) => index % 4 !== 3 && channel > 0);
  });
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/aquamine-smoke.png", fullPage: true });
  await browser.close();
  if (!canvasIsNonBlank) throw new Error("Realtime chart canvas is blank.");
  if (errors.length) throw new Error(`Browser errors:\n${errors.join("\n")}`);
  console.log("Smoke test passed: UI loaded, controls responded, chart rendered, ESG modal opened.");
} finally {
  server.kill();
}
