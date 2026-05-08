# AquaMine

Plataforma web simulada para gestao inteligente da agua na mineracao, com foco em eficiencia de reuso, reducao de desperdicios, integracao de ilhas de dados e atuacao automatica no tratamento.

## Como executar

```powershell
node server.js
```

Depois abra:

```text
http://localhost:3000
```

Tambem e possivel iniciar pelo arquivo:

```text
iniciar-aquamine.bat
```

## O que esta incluido

- Backend Node.js com API REST e dados simulados em memoria.
- Camada Express local autocontida para rodar sem baixar pacotes.
- Frontend com hooks, componentes reativos e grafico em tempo real.
- Simulacao de consumo por setor: Britagem, Processamento, Rejeitos e Transporte.
- Integracao simulada de ilhas de dados: sensores de qualidade, etapas do processo, tratamento e historico operacional.
- Monitoramento de qualidade da agua com pH, turbidez, solidos totais, condutividade e indice de reuso.
- Alertas visuais e sonoros, modo automatico/manual e resolucao de alertas.
- Modulo preditivo para prever consumo e queda de qualidade nas proximas 2h.
- Controle de reuso com reducao aproximada de 30% no consumo.
- Atuacao direta no tratamento, ajustando dosagem quimica, vazao e tempo de retencao.
- Dashboard ESG com modal de relatorio e exportacao via impressao/PDF do navegador.

## Validacao local

Foi validado por chamadas HTTP aos endpoints principais:

- `GET /api/state`
- `POST /api/reuse`
- `POST /api/predict`
- `POST /api/treatment/adjust`
- `POST /api/esg/report`

Tambem ha um roteiro de smoke test em `scripts/smoke-test.mjs`, caso o ambiente permita abrir subprocessos e Playwright.
