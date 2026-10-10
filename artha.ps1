# Artha dev control for Windows PowerShell. Same commands as ./artha on macOS/Linux;
# the logic lives in scripts/artha.mjs. Run ".\artha.ps1 help" for the list.
#   .\artha.ps1 start [desktop|web] | stop | restart | status [--json] | logs [service] [-f] | build | package
& node (Join-Path $PSScriptRoot "scripts\artha.mjs") @args
exit $LASTEXITCODE
