<#
  publish.ps1  -  One-command publish/update for an ExB custom widget repo.
  1. Copies the latest widget from the EB folder into this repo's widget subfolder
     (skips node_modules, .vs, and any working folders listed in $ExcludeDirs,
     such as "Claude outputs").
  2. Removes those excluded folders from the repo subfolder if an earlier run or a
     hand copy left them there, so they never reach GitHub or the release zip.
  3. Auto-runs 'git init' on first use if the folder is not a git repo yet.
  4. Commits.
  5. Publishes the repo to GitHub on first run, or pushes updates after.
  6. (Optional) Cuts a versioned GitHub Release with a downloadable zip.

  RUN (from a terminal opened in this repo folder):
    Normal update:            powershell -ExecutionPolicy Bypass -File .\publish.ps1
    Update + release v1.1.0:  powershell -ExecutionPolicy Bypass -File .\publish.ps1 -Release v1.1.0
    With a commit message:    powershell -ExecutionPolicy Bypass -File .\publish.ps1 -Release v1.1.0 -CommitMessage "Subject`n`nBody"

  REDO A RELEASE (the tag must not already exist on GitHub):
    gh release delete v1.1.0 --cleanup-tag --yes
    powershell -ExecutionPolicy Bypass -File .\publish.ps1 -Release v1.1.0 -CommitMessage "..."
#>

param(
    [string]$Release = "",
    [string]$CommitMessage = "Update widget ($(Get-Date -Format 'yyyy-MM-dd'))"
)

$ErrorActionPreference = "Stop"

# ----- EDIT THESE THREE PER WIDGET -----------------------------------------
$WidgetName    = "map-layers-custom"   # widget folder name (must match EB folder + repo subfolder)
$RepoName      = "map-layers-custom-widget"
$ExbWidgetPath = "C:\arcgis-experience-builder-1.21\client\your-extensions\widgets\$WidgetName"
# ----------------------------------------------------------------------------

# Folders that live in the EB widget folder but must never ship. "Claude outputs" is the
# working folder Cowork writes deliverables and zips into. Add other scratch folders here.
$ExcludeDirs  = @("node_modules", ".vs", "Claude outputs")
$ExcludeFiles = @("*.user", "*.suo", "*.zip")

$RepoPath   = $PSScriptRoot
$WidgetDest = Join-Path $RepoPath $WidgetName

Write-Host "==> Repo:   $RepoPath"
Write-Host "==> Source: $ExbWidgetPath"

if (-not (Test-Path $ExbWidgetPath)) {
    throw "Cannot find the widget folder at:`n  $ExbWidgetPath`nEdit `$ExbWidgetPath in publish.ps1."
}

Write-Host "`n==> Syncing widget files (skipping $($ExcludeDirs -join ', '))..."
# robocopy wants each excluded name as its own argument after /XD and /XF
$xd = @("/XD") + $ExcludeDirs
$xf = @("/XF") + $ExcludeFiles
robocopy "$ExbWidgetPath" "$WidgetDest" /MIR @xd @xf /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE" }

# /MIR leaves excluded folders alone on the destination side, so a folder that was mirrored
# before it was added to $ExcludeDirs stays in the repo until removed here.
foreach ($dir in $ExcludeDirs) {
    $stale = Join-Path $WidgetDest $dir
    if (Test-Path $stale) {
        Write-Host "    Removing excluded folder from repo copy: $dir"
        Remove-Item $stale -Recurse -Force
    }
}
Write-Host "    Done."

Push-Location $RepoPath
try {
    # Auto-initialize git on the first run so this script works on a fresh repo folder
    # without needing a separate manual "git init" beforehand.
    if (-not (Test-Path (Join-Path $RepoPath ".git"))) {
        Write-Host "`n==> No git repository here yet. Running 'git init'..."
        git init | Out-Null
    }

    git add -A | Out-Null
    $pending = git status --porcelain
    if ([string]::IsNullOrWhiteSpace($pending)) {
        Write-Host "`n==> No changes to commit."
    } else {
        Write-Host "`n==> Committing: $($CommitMessage.Split("`n")[0])"
        git commit -m "$CommitMessage" | Out-Null
    }

    $hasOrigin = (git remote) -contains "origin"
    $gh = Get-Command gh -ErrorAction SilentlyContinue

    if (-not $hasOrigin) {
        if ($gh) {
            Write-Host "`n==> First run: creating GitHub repo and pushing..."
            gh repo create $RepoName --public --source="." --remote="origin" --push
        } else {
            Write-Host "`n==> Repo not on GitHub yet and gh not installed. Publish once via GitHub Desktop, then re-run."
            return
        }
    } else {
        Write-Host "`n==> Pushing to GitHub..."
        git push
    }

    if ($Release -ne "") {
        if (-not $gh) {
            Write-Host "`n==> Skipping release: gh not installed. (winget install --id GitHub.cli ; gh auth login)"
        } else {
            # Fail early with a clear message instead of gh's "tag already exists"
            $existingTags = @(gh release list --limit 200 --json tagName -q ".[].tagName")
            if ($existingTags -contains $Release) {
                throw "Release $Release already exists on GitHub. Delete it first:`n  gh release delete $Release --cleanup-tag --yes`nthen run publish.ps1 again."
            }
            Write-Host "`n==> Creating release $Release ..."
            $zip = Join-Path $env:TEMP "$WidgetName.zip"
            if (Test-Path $zip) { Remove-Item $zip -Force }
            # Zip the cleaned repo copy, never the live EB folder
            Compress-Archive -Path $WidgetDest -DestinationPath $zip
            $notes = "Download $WidgetName.zip, extract, and drop the $WidgetName folder into client\your-extensions\widgets so manifest.json sits directly inside it. Then install dependencies in the client folder (npm install on Experience Builder 1.20 and earlier; pnpm install on 1.21 and later) and restart the client."
            gh release create $Release "$zip" --title "$RepoName $Release" --notes $notes
        }
    }

    Write-Host "`n==> Finished."
}
finally {
    Pop-Location
}