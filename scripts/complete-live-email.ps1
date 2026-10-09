param([Parameter(Mandatory = $true)][string]$EvidenceDirectory)
$ErrorActionPreference = 'Stop'
$liveRepoRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$liveEvidenceRoot = [IO.Path]::GetFullPath((Join-Path $liveRepoRoot 'artifacts\acceptance\P00')) + [IO.Path]::DirectorySeparatorChar
$liveEvidencePath = [IO.Path]::GetFullPath($EvidenceDirectory)
if (-not $liveEvidencePath.StartsWith($liveEvidenceRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Evidence must be inside this checkout artifacts/acceptance/P00.' }
if (-not (Test-Path -LiteralPath (Join-Path $liveEvidencePath 'pending-email.json'))) { throw 'Pending receipt not found. No email will be sent.' }
$savedLiveAuthorization = $env:LIVE_INTEGRATION
$savedLiveEvidence = $env:P00_ARTIFACT_DIR
try {
  $env:LIVE_INTEGRATION = '1'
  $env:P00_ARTIFACT_DIR = $liveEvidencePath
  Push-Location -LiteralPath $liveRepoRoot
  try {
    & node --env-file=.env.live node_modules/tsx/dist/cli.mjs tests/acceptance/P00/live-email-smoke.ts --complete
    if ($LASTEXITCODE -ne 0) { throw 'LIVE verification did not pass. No automatic resend was performed.' }
  } finally { Pop-Location }
} finally {
  $env:LIVE_INTEGRATION = $savedLiveAuthorization
  $env:P00_ARTIFACT_DIR = $savedLiveEvidence
}
