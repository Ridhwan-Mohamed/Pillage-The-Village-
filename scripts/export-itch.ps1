param(
  [switch]$BuildOnly,
  [switch]$ZipOnly
)

$ErrorActionPreference = "Stop"

$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$dist = Join-Path $workspace "dist-itch"
$zip = Join-Path $workspace "ProcessV2-itch.zip"

function Assert-InWorkspace($Path) {
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  if (-not $fullPath.StartsWith($workspace, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to touch path outside workspace: $fullPath"
  }
  return $fullPath
}

function Invoke-WithRetry($Label, [scriptblock]$Action, $Attempts = 6, $DelayMs = 500) {
  for ($i = 1; $i -le $Attempts; $i++) {
    try {
      return & $Action
    } catch {
      if ($i -eq $Attempts) { throw }
      Write-Warning "$Label failed on attempt $i/$Attempts. Retrying..."
      Start-Sleep -Milliseconds $DelayMs
    }
  }
}

function Remove-PathIfExists($Path, [switch]$Recurse) {
  $fullPath = Assert-InWorkspace $Path
  if (-not (Test-Path -LiteralPath $fullPath)) { return }

  Invoke-WithRetry "Remove $fullPath" {
    if ($Recurse) {
      Remove-Item -LiteralPath $fullPath -Recurse -Force -ErrorAction Stop
    } else {
      Remove-Item -LiteralPath $fullPath -Force -ErrorAction Stop
    }
  }
}

function Build-Itch($OutputDir, [switch]$Clean) {
  $fullOutputDir = Assert-InWorkspace $OutputDir
  if ($Clean) {
    Remove-PathIfExists $fullOutputDir -Recurse
  }

  Push-Location $workspace
  try {
    & parcel build ./src/index.html --public-url ./ --dist-dir $fullOutputDir --no-scope-hoist
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  } finally {
    Pop-Location
  }
}

function Zip-Itch($SourceDir) {
  $fullSourceDir = Assert-InWorkspace $SourceDir
  $indexPath = Join-Path $fullSourceDir "index.html"
  if (-not (Test-Path -LiteralPath $indexPath)) {
    throw "$indexPath missing. Build itch export first."
  }

  $tempZip = Join-Path $workspace "ProcessV2-itch.tmp.$PID.zip"
  Remove-PathIfExists $tempZip

  Invoke-WithRetry "Create itch zip" {
    Compress-Archive `
      -Path (Join-Path $fullSourceDir "*") `
      -DestinationPath $tempZip `
      -CompressionLevel Optimal `
      -Force `
      -ErrorAction Stop
  }

  Remove-PathIfExists $zip
  Move-Item -LiteralPath $tempZip -Destination $zip -Force -ErrorAction Stop

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::OpenRead($zip)
  try {
    $rootIndex = $archive.Entries | Where-Object { $_.FullName -eq "index.html" } | Select-Object -First 1
    if (-not $rootIndex) { throw "Zip does not contain index.html at the root." }
    $zipItem = Get-Item -LiteralPath $zip
    Write-Host "Created $($zipItem.FullName) ($([Math]::Round($zipItem.Length / 1MB, 2)) MB, $($archive.Entries.Count) entries)"
  } finally {
    $archive.Dispose()
  }
}

if ($BuildOnly -and $ZipOnly) {
  throw "Use either -BuildOnly or -ZipOnly, not both."
}

if ($BuildOnly) {
  Build-Itch $dist -Clean
  exit 0
}

if ($ZipOnly) {
  Zip-Itch $dist
  exit 0
}

$tempDist = Join-Path $workspace "dist-itch-export-$PID"
try {
  Build-Itch $tempDist -Clean
  Zip-Itch $tempDist

  try {
    Remove-PathIfExists $dist -Recurse
    Move-Item -LiteralPath $tempDist -Destination $dist -Force -ErrorAction Stop
    $tempDist = $null
  } catch {
    Write-Warning "Zip was created, but dist-itch could not be refreshed: $($_.Exception.Message)"
  }
} finally {
  if ($tempDist -and (Test-Path -LiteralPath $tempDist)) {
    Remove-PathIfExists $tempDist -Recurse
  }
}
