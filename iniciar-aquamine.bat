@echo off
cd /d "%~dp0"
echo Iniciando AquaMine...
echo.
if exist "C:\Users\Filipe\AppData\Local\OpenAI\Codex\bin\node.exe" (
  "C:\Users\Filipe\AppData\Local\OpenAI\Codex\bin\node.exe" server.js
) else if exist "C:\Users\Filipe\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
  "C:\Users\Filipe\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" server.js
) else (
  echo Nao encontrei o Node.js no computador.
  echo Instale o Node.js em https://nodejs.org ou me avise para eu criar outra forma de abrir.
)
echo.
pause
