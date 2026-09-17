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
  6. (Optional) Cuts a versioned GitHub Release with a downloadable zip. The zip is
     built from a staging copy with the editor-only files in $ReleaseOnlyExclude
     removed (Visual Studio type shims, dev tools). Those stay in the GitHub repo.
     The release tag must equal the version in manifest.json and package.json, and
     those two must agree, so a release can never ship a version nobody bumped.

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

# ----- EDIT THESE PER WIDGET -----------------------------------------------
$WidgetName     = "map-layers-custom"   # widget folder name (must match EB folder + repo subfolder)
$RepoName       = "map-layers-custom-widget"
$ExbWidgetPath  = "C:\arcgis-experience-builder-1.21\client\your-extensions\widgets\$WidgetName"
$RepoVisibility = "public"      # "public" or "private"; only used by gh repo create on the first run
# ----------------------------------------------------------------------------

# Folders that live in the EB widget folder but must never ship. "Claude outputs" is the
# working folder Cowork writes deliverables and zips into. Add other scratch folders here.
$ExcludeDirs  = @("node_modules", ".vs", "Claude outputs")
$ExcludeFiles = @("*.user", "*.suo", "*.zip")

# Editor-only files that belong in the GitHub repo but NOT in the release zip.
# The *.d.ts shims use ambient `declare module 'react' | 'jimu-*' | 'esri/*'` blocks. Ambient
# declarations are not file-scoped, so when a downstream developer drops the zip into
# your-extensions they rewrite the react / jimu / esri types for every other widget in that
# folder and flood tsc with errors (reported on draw-advanced 4.5.1). They are only there so
# Visual Studio can type check this widget in isolation (playbook Section 12, item 3).
# Paths are relative to the widget folder; wildcards allowed in the leaf name; patterns match
# one folder level only, so a shim that lives deeper needs its own entry.
$ReleaseOnlyExclude = @(
    "src\exb-editor-shims*.d.ts",
    "src\*-shims.d.ts",
    "src\editor-shims.d.ts",
    "src\runtime\esri.d.ts",
    "src\typings.d.ts",   # widget-specific ambient jimu-core / jimu-icons additions beside the master shim
    "tools"
)

$RepoPath   = $PSScriptRoot
$WidgetDest = Join-Path $RepoPath $WidgetName

Write-Host "==> Repo:   $RepoPath"
Write-Host "==> Source: $ExbWidgetPath"

if (-not (Test-Path $ExbWidgetPath)) {
    throw "Cannot find the widget folder at:`n  $ExbWidgetPath`nEdit `$ExbWidgetPath in publish.ps1."
}

# Version guard, read from the EB source folder because that is the single source of truth.
# manifest.json and package.json must agree; a release tag must equal v<that version>.
function Get-JsonVersion([string]$path) {
    if (-not (Test-Path $path)) { return $null }
    try { return (Get-Content $path -Raw | ConvertFrom-Json).version } catch { return $null }
}
$manifestVersion = Get-JsonVersion (Join-Path $ExbWidgetPath "manifest.json")
$packageVersion  = Get-JsonVersion (Join-Path $ExbWidgetPath "package.json")
Write-Host "==> Version: manifest.json $manifestVersion, package.json $packageVersion"
if ($manifestVersion -and $packageVersion -and ($manifestVersion -ne $packageVersion)) {
    $msg = "manifest.json is $manifestVersion but package.json is $packageVersion. Bump both together, in the EB folder."
    if ($Release -ne "") { throw $msg } else { Write-Warning $msg }
}
if ($Release -ne "") {
    if ($Release -notmatch '^v\d+\.\d+\.\d+$') { throw "Release tag must look like v1.2.3. Received: $Release" }
    if ($manifestVersion -and ($Release -ne "v$manifestVersion")) {
        throw "Release tag $Release does not match manifest.json version $manifestVersion. Bump manifest.json and package.json in the EB folder (never the repo copy; /MIR reverts it), or pass -Release v$manifestVersion."
    }
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

# The manifest has to sit directly inside the widget folder. A second level of nesting is
# the most common downstream install failure ("<name> is duplicated").
if (-not (Test-Path (Join-Path $WidgetDest "manifest.json"))) {
    throw "manifest.json is not directly inside $WidgetDest. The copy is wrong; do not publish it."
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
            Write-Host "`n==> First run: creating GitHub repo ($RepoVisibility) and pushing..."
            gh repo create $RepoName "--$RepoVisibility" --source="." --remote="origin" --push
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

            # Stage a clean copy of the repo subfolder (never the live EB folder), strip the
            # editor-only files, and zip that. The repo copy itself is untouched, so the shims
            # stay on GitHub.
            $stage     = Join-Path $env:TEMP "$WidgetName-release-stage"
            $stageCopy = Join-Path $stage $WidgetName
            if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
            New-Item -ItemType Directory -Path $stage | Out-Null
            robocopy "$WidgetDest" "$stageCopy" /E /NFL /NDL /NJH /NJS /NP | Out-Null
            if ($LASTEXITCODE -ge 8) { throw "robocopy (release stage) failed with exit code $LASTEXITCODE" }

            foreach ($pattern in $ReleaseOnlyExclude) {
                $rel    = Split-Path $pattern -Parent
                $parent = if ([string]::IsNullOrEmpty($rel)) { $stageCopy } else { Join-Path $stageCopy $rel }
                $leaf   = Split-Path $pattern -Leaf
                if (Test-Path $parent) {
                    Get-ChildItem -Path $parent -Filter $leaf -Force -ErrorAction SilentlyContinue | ForEach-Object {
                        Write-Host "    Leaving out of release zip: $($_.FullName.Substring($stageCopy.Length + 1))"
                        Remove-Item $_.FullName -Recurse -Force
                    }
                }
            }

            # Guard: no ambient editor shim may survive into the zip
            $leaked = Get-ChildItem -Path $stageCopy -Recurse -File -Filter "*.d.ts" |
                Where-Object { Select-String -Path $_.FullName -Pattern "declare module ['`"](react|jimu-|esri/)" -Quiet }
            if ($leaked) {
                throw "Editor shim still in release stage: $($leaked.FullName -join ', '). Add it to `$ReleaseOnlyExclude."
            }

            Compress-Archive -Path $stageCopy -DestinationPath $zip
            Remove-Item $stage -Recurse -Force

            $notes = "Download $WidgetName.zip, extract, and drop the $WidgetName folder into client\your-extensions\widgets so manifest.json sits directly inside it. Then install dependencies in the client folder (npm install on Experience Builder 1.20 and earlier; pnpm install on 1.21 and later) and restart the client. Visual Studio type shims (src/*.d.ts editor files) are left out of this zip on purpose; they are in the GitHub repo if you want them."
            gh release create $Release "$zip" --title "$RepoName $Release" --notes $notes
        }
    }

    Write-Host "`n==> Finished."
}
finally {
    Pop-Location
}
