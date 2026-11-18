package main

// Read-only Founder OS diagnostics viewer. This command is independent of FOS
// HTTP/auth, so it remains useful during DPAPI/Next.js startup failures.
import (
  "bufio"
  "context"
  "encoding/base64"
  "encoding/binary"
  "encoding/json"
  "errors"
  "fmt"
  "io"
  "os"
  "os/exec"
  "path/filepath"
  "regexp"
  "strconv"
  "strings"
  "time"
  "unicode/utf16"

  "github.com/spf13/cobra"
)

type fosEvent struct {
  Schema string `json:"schema"`
  Time string `json:"time"`
  Level string `json:"level"`
  Component string `json:"component"`
  Event string `json:"event"`
  RunID string `json:"runId"`
  Result string `json:"result"`
  ErrorCode string `json:"errorCode"`
  HTTPStatus int `json:"httpStatus"`
  FreeMemoryMB float64 `json:"freeMemoryMB"`
}
const fosFileName = "events.jsonl"

func defaultFOSLogDir() string {
  home, _ := os.UserHomeDir()
  return filepath.Join(home, ".hermes", "diagnostics", "founder-os")
}
func newFOSCommand() *cobra.Command {
  fos := &cobra.Command{Use: "fos", Short: "Read Founder OS incident diagnostics independently of its API"}
  var directory, remote, level, component string
  var tail int
  var follow, raw bool
  logs := &cobra.Command{Use: "logs", Short: "Inspect local or SSH-hosted FOS JSONL events",
    RunE: func(cmd *cobra.Command, _ []string) error {
      if tail < 1 || tail > 2000 { return errors.New("tail must be 1..2000") }
      if remote != "" {
        return streamRemoteFOS(cmd.Context(), remote, tail, follow, level, component, raw, cmd.OutOrStdout())
      }
      return showLocalFOS(cmd.Context(), directory, tail, follow, level, component, raw, cmd.OutOrStdout())
    }}
  logs.Flags().StringVar(&directory, "dir", defaultFOSLogDir(), "Local FOS diagnostic directory")
  logs.Flags().StringVar(&remote, "ssh", "", "Windows OpenSSH host (e.g. user@mini-pc1); batch mode, no password prompts")
  logs.Flags().StringVar(&level, "level", "", "Filter by severity (INFO, WARN, ERROR, CRITICAL)")
  logs.Flags().StringVar(&component, "component", "", "Exact component filter")
  logs.Flags().IntVar(&tail, "tail", 100, "Most recent events (1..2000)")
  logs.Flags().BoolVar(&follow, "follow", false, "Follow new events in real time")
  logs.Flags().BoolVar(&raw, "json", false, "Emit complete JSONL records instead of formatted entries")
  fos.AddCommand(logs)

  var statusDir, statusRemote string
  status := &cobra.Command{Use: "status", Short: "Show latest recorded readiness and failures (not a live auth check)",
    RunE: func(cmd *cobra.Command, _ []string) error {
      var lines []string
      var err error
      if statusRemote != "" {
        lines, err = remoteFOSLines(cmd.Context(), statusRemote, 200)
      } else {
        lines, err = tailFOS(filepath.Join(statusDir, fosFileName), 200)
      }
      if err != nil { return err }
      return printFOSStatus(lines, cmd.OutOrStdout())
    }}
  status.Flags().StringVar(&statusDir, "dir", defaultFOSLogDir(), "Local diagnostic directory")
  status.Flags().StringVar(&statusRemote, "ssh", "", "Windows OpenSSH host")
  fos.AddCommand(status)
  return fos
}
func parseFOSEvent(line string) (fosEvent, bool) {
  var e fosEvent
  if len(line) > 8192 || json.Unmarshal([]byte(line), &e) != nil ||
    e.Schema != "mvx.fos.diagnostic.v1" { return e, false }
  return e, true
}
func renderFOSEvent(line, level, component string, raw bool, out io.Writer) {
  e, ok := parseFOSEvent(line)
  if !ok { fmt.Fprintln(out, "[INVALID_FOS_LOG_RECORD]"); return }
  if level != "" && !strings.EqualFold(level, e.Level) { return }
  if component != "" && component != e.Component { return }
  if raw { fmt.Fprintln(out, line); return }
  detail := e.Result
  if e.ErrorCode != "" { detail += " code=" + e.ErrorCode }
  if e.HTTPStatus > 0 { detail += fmt.Sprintf(" http=%d", e.HTTPStatus) }
  if e.FreeMemoryMB > 0 { detail += fmt.Sprintf(" freeRAM=%.0fMB", e.FreeMemoryMB) }
  fmt.Fprintf(out, "%s %-8s %-20s %-26s %s
", e.Time, e.Level, e.Component, e.Event, strings.TrimSpace(detail))
}
func tailFOS(file string, n int) ([]string, error) {
  f, err := os.Open(file)
  if err != nil { return nil, fmt.Errorf("FOS diagnostics unavailable (%s): %w", file, err) }
  defer f.Close()
  lines := make([]string, 0, n)
  sc := bufio.NewScanner(f)
  sc.Buffer(make([]byte, 4096), 8192)
  for sc.Scan() {
    if len(lines) == n { copy(lines, lines[1:]); lines[n-1] = sc.Text() } else {
      lines = append(lines, sc.Text())
    }
  }
  if err := sc.Err(); err != nil { return nil, err }
  return lines, nil
}
func showLocalFOS(ctx context.Context, dir string, n int, follow bool,
  level, component string, raw bool, out io.Writer) error {
  file := filepath.Join(dir, fosFileName)
  lines, err := tailFOS(file, n)
  if err != nil { return err }
  for _, line := range lines { renderFOSEvent(line, level, component, raw, out) }
  if !follow { return nil }
  stat, err := os.Stat(file)
  if err != nil { return err }
  offset, previous := stat.Size(), stat
  tick := time.NewTicker(time.Second)
  defer tick.Stop()
  remaining := ""
  for {
    select {
    case <-ctx.Done(): return nil
    case <-tick.C:
      current, err := os.Stat(file)
      if err != nil { continue }
      if !os.SameFile(previous, current) || current.Size() < offset {
        previous, offset, remaining = current, 0, ""
      }
      if current.Size() == offset { continue }
      f, err := os.Open(file)
      if err != nil { continue }
      _, seekErr := f.Seek(offset, io.SeekStart)
      if seekErr != nil { f.Close(); continue }
      // Bounded per-poll read: avoid unlimited memory use on a busy/unstable host.
      size := current.Size() - offset
      if size > 256*1024 {
        offset = current.Size() - 256*1024
        f.Seek(offset, io.SeekStart)
        remaining = ""
        size = 256 * 1024
      }
      block, readErr := io.ReadAll(io.LimitReader(f, size))
      f.Close()
      if readErr != nil { continue }
      offset += int64(len(block))
      parts := strings.Split(remaining + string(block), "
")
      remaining = parts[len(parts)-1]
      if len(remaining) > 8192 { remaining = ""; fmt.Fprintln(out, "[FOS_LOG_LINE_TOO_LONG]") }
      for _, line := range parts[:len(parts)-1] {
        if line != "" { renderFOSEvent(line, level, component, raw, out) }
      }
    }
  }
}
var allowedSSHHost = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]*(?:@[a-zA-Z0-9][a-zA-Z0-9._-]*)?$`)
func remoteCommand(host string, n int, follow bool) (*exec.Cmd, error) {
  if len(host) > 180 || !allowedSSHHost.MatchString(host) { return nil, errors.New("invalid SSH host") }
  script := "$f=Join-Path $env:USERPROFILE '.hermes\diagnostics\founder-os\events.jsonl';" +
    "if(!(Test-Path -LiteralPath $f)){[Console]::Error.WriteLine('FOS_DIAGNOSTICS_LOG_MISSING');exit 2};" +
    "Get-Content -LiteralPath $f -Encoding UTF8 -Tail " + strconv.Itoa(n)
  if follow { script += " -Wait" }
  chars := utf16.Encode([]rune(script))
  bytes := make([]byte, len(chars)*2)
  for i, c := range chars { binary.LittleEndian.PutUint16(bytes[i*2:], c) }
  encoded := base64.StdEncoding.EncodeToString(bytes)
  return exec.Command("ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=5",
    host, "powershell.exe", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded), nil
}
func remoteFOSLines(ctx context.Context, host string, n int) ([]string, error) {
  cmd, err := remoteCommand(host, n, false)
  if err != nil { return nil, err }
  cmd = exec.CommandContext(ctx, cmd.Path, cmd.Args[1:]...)
  output, err := cmd.Output()
  if err != nil { return nil, fmt.Errorf("SSH diagnostics read failed: %w", err) }
  text := strings.TrimSuffix(strings.ReplaceAll(string(output), "
", "
"), "
")
  if text == "" { return nil, nil }
  return strings.Split(text, "
"), nil
}
func streamRemoteFOS(ctx context.Context, host string, n int, follow bool,
  level, component string, raw bool, out io.Writer) error {
  cmd, err := remoteCommand(host, n, follow)
  if err != nil { return err }
  cmd = exec.CommandContext(ctx, cmd.Path, cmd.Args[1:]...)
  reader, err := cmd.StdoutPipe()
  if err != nil { return err }
  cmd.Stderr = os.Stderr
  if err := cmd.Start(); err != nil { return err }
  scanner := bufio.NewScanner(reader)
  scanner.Buffer(make([]byte, 4096), 8192)
  for scanner.Scan() { renderFOSEvent(scanner.Text(), level, component, raw, out) }
  if err := scanner.Err(); err != nil { return err }
  return cmd.Wait()
}
func printFOSStatus(lines []string, out io.Writer) error {
  readiness := "NO_EVIDENCE"
  errorsCount := 0
  lastError := "none"
  lastTime := ""
  for _, line := range lines {
    e, ok := parseFOSEvent(line)
    if !ok { continue }
    lastTime = e.Time
    if e.Event == "readiness_evaluation" { readiness = e.Result }
    if e.Event == "startup_begin" { readiness = "starting" }
    if e.Event == "decrypt_failed" || e.Event == "startup_aborted" ||
      e.Event == "child_exited" || e.Event == "spawn_error" {
      readiness = "not_ready"
    }
    if e.Event == "http_probe" && e.Result != "healthy" && e.Result != "auth_required" {
      readiness = "not_ready"
    }
    if e.Level == "ERROR" || e.Level == "CRITICAL" {
      errorsCount++
      lastError = e.Time + " " + e.Component + "/" + e.Event + " " + e.ErrorCode
    }
  }
  fmt.Fprintf(out, "FOS diagnostic ledger (not an authenticated live API check)
Last event: %s
Last readiness: %s
Errors in last %d events: %d
Last error: %s
",
    lastTime, readiness, len(lines), errorsCount, lastError)
  return nil
}
