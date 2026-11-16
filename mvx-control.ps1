$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
& node (Join-Path $scriptDir 'mvx_service_control.cjs') @args
exit $LASTEXITCODE
