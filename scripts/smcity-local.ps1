[CmdletBinding()]
param([switch]$Dev, [switch]$SkipGitSync, [switch]$SkipInstall)

$ErrorActionPreference = "Stop"
$Branch = "smcity/editor-scenario-tools"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Invoke-Step {
    param([string]$Label, [scriptblock]$Command)
    Write-Host "`n==> $Label" -ForegroundColor Cyan
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "Échec de l’étape '$Label' (code $LASTEXITCODE)." }
}

Set-Location $RepoRoot
Write-Host "SmCity — vérification et compilation locale" -ForegroundColor Green
Write-Host "Dépôt : $RepoRoot"

if (-not $SkipGitSync) {
    $currentBranch = (& git branch --show-current).Trim()
    if ($LASTEXITCODE -ne 0) { throw "Impossible de lire la branche Git." }
    if ($currentBranch -ne $Branch) { throw "Branche active '$currentBranch'. Bascule d’abord sur '$Branch' ; aucun changement de branche automatique." }
    $dirty = & git status --porcelain
    if ($LASTEXITCODE -ne 0) { throw "Impossible de vérifier l’état Git." }
    if ($dirty) {
        Write-Host ($dirty -join "`n") -ForegroundColor Yellow
        throw "Le dépôt contient des modifications locales. Rien n’a été écrasé ; sauvegarde ou committe-les avant de relancer."
    }
    Invoke-Step "Synchronisation GitHub (avance rapide uniquement)" {
        git fetch origin $Branch
        if ($LASTEXITCODE -ne 0) { return }
        git pull --ff-only origin $Branch
    }
}

$emsdkScript = $null
if ($env:EMSDK -and (Test-Path (Join-Path $env:EMSDK "emsdk_env.ps1"))) {
    $emsdkScript = Join-Path $env:EMSDK "emsdk_env.ps1"
} elseif (Test-Path "C:\Devtools\emsdk\emsdk_env.ps1") {
    $emsdkScript = "C:\Devtools\emsdk\emsdk_env.ps1"
}
if (-not $emsdkScript) { throw "Emscripten introuvable. Installe-le dans C:\Devtools\emsdk ou définis la variable EMSDK." }

# Bypass limité au processus courant : aucune modification de la politique système.
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
. $emsdkScript
if ($LASTEXITCODE -ne 0) { throw "Échec de l’activation Emscripten." }
if (-not (Get-Command em++ -ErrorAction SilentlyContinue)) { throw "em++ reste introuvable après activation d’Emscripten." }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js est introuvable." }
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { throw "pnpm est introuvable." }
$nodeMajor = [int]((& node -p "process.versions.node.split('.')[0]").Trim())
if ($nodeMajor -lt 20) { throw "Node.js 20 ou supérieur est requis (version détectée : $nodeMajor)." }

if (-not $SkipInstall) { Invoke-Step "Installation reproductible des dépendances" { pnpm install --frozen-lockfile --ignore-scripts --prod=false } }
Invoke-Step "Compilation du moteur C++ / WASM et installation des assets" { pnpm --filter @micropolis/engine-wasm run build }
Invoke-Step "Contrôle Svelte / TypeScript" { pnpm --filter micropolis run check }
Invoke-Step "Tests Micropolis" { pnpm --filter micropolis exec vitest run --exclude cli/entry.smoke.test.ts --exclude src/lib/monorepo.integration.test.ts }
Invoke-Step "Build de production Vite" { pnpm --filter micropolis exec vite build }

Write-Host "`nVérifications terminées : moteur WASM, TypeScript, tests et build." -ForegroundColor Green
if ($Dev) {
    Write-Host "`nDémarrage du serveur de développement (Ctrl+C pour arrêter)." -ForegroundColor Green
    pnpm --filter micropolis run dev
    if ($LASTEXITCODE -ne 0) { throw "Le serveur de développement s’est arrêté avec le code $LASTEXITCODE." }
}
