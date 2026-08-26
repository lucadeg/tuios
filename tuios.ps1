$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$cliScript = Join-Path $scriptDir "hermes-cli.js"
& node $cliScript @args
exit $LASTEXITCODE
