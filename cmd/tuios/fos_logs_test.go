package main

import (
  "bytes"
  "context"
  "os"
  "path/filepath"
  "strings"
  "testing"
)

const sampleFOSEvent = `{"schema":"mvx.fos.diagnostic.v1","time":"2026-11-18T13:00:00Z","level":"ERROR","component":"dpapi","event":"decrypt_failed","errorCode":"CRON_V2_VAULT_DPAPI_DECRYPT_FAILED"}`

func TestFOSTailAndFilters(t *testing.T) {
  dir := t.TempDir()
  file := filepath.Join(dir, fosFileName)
  if err := os.WriteFile(file, []byte(sampleFOSEvent+"
"), 0600); err != nil { t.Fatal(err) }
  lines, err := tailFOS(file, 20)
  if err != nil || len(lines) != 1 { t.Fatalf("tail=%v error=%v", lines, err) }
  var output bytes.Buffer
  if err := showLocalFOS(context.Background(), dir, 20, false, "ERROR", "dpapi", false, &output); err != nil { t.Fatal(err) }
  if !strings.Contains(output.String(), "decrypt_failed") { t.Fatal(output.String()) }
  output.Reset()
  if err := showLocalFOS(context.Background(), dir, 20, false, "INFO", "", false, &output); err != nil { t.Fatal(err) }
  if output.Len() != 0 { t.Fatalf("unexpected INFO: %s", output.String()) }
}
func TestFOSInvalidRecordIsNotEchoed(t *testing.T) {
  var output bytes.Buffer
  renderFOSEvent("Bearer secret-value", "", "", true, &output)
  if strings.Contains(output.String(), "secret-value") { t.Fatal("invalid input leaked") }
}
func TestFOSSSHRejectsInjection(t *testing.T) {
  for _, host := range []string{"-evil", "mini-pc;rm -rf /", "host name", "x@-y"} {
    if _, err := remoteCommand(host, 5, false); err == nil { t.Fatalf("accepted %q", host) }
  }
  if _, err := remoteCommand("Deglu@mini-pc1", 50, false); err != nil { t.Fatal(err) }
}
func TestFOSStatusDoesNotClaimLiveHealth(t *testing.T) {
  var output bytes.Buffer
  if err := printFOSStatus([]string{sampleFOSEvent}, &output); err != nil { t.Fatal(err) }
  if !strings.Contains(output.String(), "NO_EVIDENCE") || !strings.Contains(output.String(), "decrypt_failed") {
    t.Fatal(output.String())
  }
}
func TestFOSSubcommandRegistered(t *testing.T) {
  cmd, _, err := newRootCommand().Find([]string{"fos", "logs"})
  if err != nil || cmd == nil || cmd.Name() != "logs" { t.Fatalf("missing fos logs: %v", err) }
}
