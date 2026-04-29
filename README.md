# AquaMine AI

Plataforma web simulada para gestao inteligente de agua na mineracao, com dashboard em tempo real, alertas, IA preditiva, automacao, reuso, Digital Twin e indicadores ESG.

## Como executar

```powershell
node server.js
```

Depois abra:

```text
http://localhost:3000
```

## O que esta incluido

- Backend Node.js com API REST e dados simulados em memoria.
- Camada Express local autocontida para rodar sem baixar pacotes.
- Frontend com hooks, componentes reativos e grafico em tempo real.
- Simulacao de consumo por setor: Britagem, Processamento, Rejeitos e Transporte.
- Alertas visuais e sonoros, modo automatico/manual e resolucao de alertas.
- Modulo de IA simulado para previsao das proximas 2h.
- Controle de reuso com reducao aproximada de 30% no consumo.
- Dashboard ESG com modal de relatorio e exportacao via impressao/PDF do navegador.

## Validacao local

Foi validado por chamadas HTTP aos endpoints principais:

- `GET /api/state`
- `POST /api/reuse`
- `POST /api/predict`
- `POST /api/esg/report`

Tambem ha um roteiro de smoke test em `scripts/smoke-test.mjs`, caso o ambiente permita abrir subprocessos e Playwright.
