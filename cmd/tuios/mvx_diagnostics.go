package main

// Native TUIOS read-only viewer for all projects in the MVX launcher catalog.
// It needs no live application, no Next/Vite HTTP, no owner session and no
// credentials beyond the operator's existing filesystem/SSH permissions.
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
 "sort"
 "strconv"
 "strings"
 "time"
 "unicode/utf16"

 "github.com/spf13/cobra"
)
var mvxSlug=regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,79}$`)
var mvxSafeValue=regexp.MustCompile(`^[A-Za-z0-9_.:-]{1,96}$`)
var mvxSSHHost=regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]*(?:@[A-Za-z0-9][A-Za-z0-9._-]*)?$`)
const mvxDiagnosticsFile="events.jsonl"

func validateMVXID(id string) error {
 if !mvxSlug.MatchString(id) { return errors.New("invalid project ID") }
 return nil
}
func mvxHome() string {
 home,_:=os.UserHomeDir()
 return filepath.Join(home,".hermes")
}
func mvxCatalogPath() string {
 return filepath.Join(mvxHome(),"tuios","config","mvx-projects.json")
}
func registeredMVXProject(id string) error {
 if err:=validateMVXID(id);err!=nil{return err}
 data,err:=os.ReadFile(mvxCatalogPath())
 if err!=nil{return fmt.Errorf("TUIOS project inventory unavailable: %w",err)}
 var catalog struct { Projects []struct { ID string } }
 // Explicit parser: json.Unmarshal matches the ID field case-insensitively.
 if err:=json.Unmarshal(data,&catalog);err!=nil{return err}
 for _,p:=range catalog.Projects {
  if p.ID==id{return nil}
 }
 return fmt.Errorf("not registered in TUIOS project inventory: %s",id)
}
func mvxEventPath(id string) string {
 return filepath.Join(mvxHome(),".mvx-tuios-runtime","diagnostics",id,mvxDiagnosticsFile)
}
func validMVXPath(file string) error {
 root:=mvxHome()
 rel,err:=filepath.Rel(root,file)
 if err!=nil||rel==".."||strings.HasPrefix(rel,".."+string(filepath.Separator)) {
  return errors.New("diagnostic path outside .hermes")
 }
 current:=root
 for _,part:=range strings.Split(rel,string(filepath.Separator)) {
  if part==""||part=="." {continue}
  st,err:=os.Lstat(current)
  if err!=nil {return err}
  if st.Mode()&os.ModeSymlink!=0 {return errors.New("diagnostic symlink rejected") }
  current=filepath.Join(current,part)
 }
 st,err:=os.Lstat(file)
 if err!=nil{return err}
 if !st.Mode().IsRegular()||st.Mode()&os.ModeSymlink!=0{return errors.New("nonregular diagnostic log rejected")}
 return nil
}
func mvxSafeString(v any) string {
 s,ok:=v.(string)
 if !ok||!mvxSafeValue.MatchString(s){return ""}
 return s
}
func mvxParseEvent(line string,expectedProject string) (map[string]any,bool) {
 if len(line)>8192{return nil,false}
 var raw map[string]any
 if json.Unmarshal([]byte(line),&raw)!=nil{return nil,false}
 schema:=mvxSafeString(raw["schema"])
 if schema!="mvx.tuios.diagnostic.v1"&&!(schema=="mvx.fos.diagnostic.v1"&&expectedProject=="mvx-founder-os"){
  return nil,false
 }
 if schema=="mvx.tuios.diagnostic.v1"&&raw["projectId"]!=expectedProject{return nil,false}
 if _,ok:=raw["time"].(string);!ok{return nil,false}
 event:=map[string]any{}
 for _,name:=range []string{"time","schema","projectId","level","component","event","result","errorCode","errorName","runId","mode"} {
  if str:=mvxSafeString(raw[name]);str!="" { event[name]=str }
 }
 // Timestamps have hyphens and colons; disallow suspicious strings.
 timeValue,ok:=raw["time"].(string)
 if !ok||len(timeValue)>40||!strings.HasSuffix(timeValue,"Z"){return nil,false}
 if _,err:=time.Parse(time.RFC3339Nano,timeValue);err!=nil{return nil,false}
 event["time"]=timeValue
 event["projectId"]=expectedProject
 for _,name:=range []string{"port","httpStatus","pid","exitCode","durationMs","freeMemoryMB"} {
  if num,ok:=raw[name].(float64);ok&&num>=-1&&num<1e12{event[name]=num}
 }
 if mvxSafeString(event["event"])=="" {return nil,false}
 return event,true
}
func mvxTail(file string,limit int,project string)([]map[string]any,error){
 if limit<1||limit>2000{return nil,errors.New("tail must be between 1 and 2000")}
 if err:=validMVXPath(file);err!=nil{
  if os.IsNotExist(err){return []map[string]any{},nil}
  return nil,err
 }
 f,err:=os.Open(file);if err!=nil{return nil,err};defer f.Close()
 scanner:=bufio.NewScanner(f)
 scanner.Buffer(make([]byte,4096),8192)
 events:=make([]map[string]any,0,limit)
 for scanner.Scan(){
  e,ok:=mvxParseEvent(scanner.Text(),project);if !ok{continue}
  if len(events)>=limit {copy(events,events[1:]);events[len(events)-1]=e}else{events=append(events,e)}
 }
 return events,scanner.Err()
}
func mvxEvents(id string,tail int)([]map[string]any,error){
 files:=[]string{mvxEventPath(id)}
 if id=="mvx-founder-os" {
  files=append(files,filepath.Join(mvxHome(),"diagnostics","founder-os","events.jsonl"))
 }
 var all []map[string]any
 for _,file:=range files {
  events,err:=mvxTail(file,tail,id);if err!=nil{return nil,err}
  all=append(all,events...)
 }
 sort.SliceStable(all,func(i,j int)bool {
  return all[i]["time"].(string)<all[j]["time"].(string)
 })
 if len(all)>tail{return all[len(all)-tail:],nil}
 return all,nil
}
func mvxRender(events []map[string]any,level,component string,jsonMode bool,output io.Writer){
 for _,event:=range events{
  if level!=""&&event["level"]!=strings.ToUpper(level){continue}
  if component!=""&&event["component"]!=component{continue}
  if jsonMode{b,_:=json.Marshal(event);fmt.Fprintln(output,string(b));continue}
  fmt.Fprintf(output,"%s %-8v %-23v %-24v code=%v result=%v
",
   event["time"],event["level"],event["component"],event["event"],
   event["errorCode"],event["result"])
 }
}
func mvxStatus(events []map[string]any,output io.Writer){
 state:="NO_EVIDENCE";lastError:="none";lastTime:="none"
 for _,e:=range events{
  lastTime=fmt.Sprint(e["time"])
  name:=fmt.Sprint(e["event"])
  switch name {
  case "startup_begin","launch_requested","managed_process_started":
   state="STARTING"
  case "http_readiness_verified":
   state="HTTP_REACHABLE_NOT_AUTH_CERTIFIED"
  case "decrypt_failed","startup_aborted","child_exited","managed_process_exited",
       "spawn_failed","reported_failure","readiness_timeout":
   state="NOT_READY"
  case "http_probe","readiness_evaluation":
   if e["result"]=="http_ready"||e["result"]=="healthy"||e["result"]=="reachable"||e["result"]=="auth_required" {
    state="HTTP_REACHABLE_NOT_AUTH_CERTIFIED"
   }else{state="NOT_READY"}
  }
  if e["level"]=="ERROR"||e["level"]=="CRITICAL" {
   lastError=fmt.Sprint(e["time"]," ",e["component"],"/",e["event"]," ",e["errorCode"])
  }
 }
 fmt.Fprintf(output,"MVX recorded diagnostics (not live authenticated readiness)
Last: %s
State: %s
Last error: %s
",lastTime,state,lastError)
}
func mvxRemoteCommand(host,id string,n int,follow bool)(*exec.Cmd,error){
 if len(host)>180||!mvxSSHHost.MatchString(host){return nil,errors.New("invalid SSH target")}
 if err:=validateMVXID(id);err!=nil{return nil,err}
 script:="$f=Join-Path $env:USERPROFILE '.hermes\.mvx-tuios-runtime\diagnostics\"+id+"\events.jsonl';"+
 "if(!(Test-Path -LiteralPath $f)){[Console]::Error.WriteLine('MVX_DIAGNOSTICS_LOG_MISSING');exit 2};"+
 "Get-Content -LiteralPath $f -Encoding UTF8 -Tail "+strconv.Itoa(n)
 if follow{script+=" -Wait"}
 chars:=utf16.Encode([]rune(script))
 buf:=make([]byte,2*len(chars))
 for i,c:=range chars{binary.LittleEndian.PutUint16(buf[i*2:],c)}
 return exec.Command("ssh","-o","BatchMode=yes","-o","StrictHostKeyChecking=yes",
 "-o","ConnectTimeout=5",host,"powershell.exe","-NoProfile","-NonInteractive",
 "-EncodedCommand",base64.StdEncoding.EncodeToString(buf)),nil
}
func mvxRemoteEvents(ctx context.Context,host,id string,tail int,follow bool,level,component string,jsonMode bool,out io.Writer)error{
 cmd,err:=mvxRemoteCommand(host,id,tail,follow);if err!=nil{return err}
 cmd=exec.CommandContext(ctx,cmd.Path,cmd.Args[1:]...)
 reader,err:=cmd.StdoutPipe();if err!=nil{return err}
 cmd.Stderr=os.Stderr
 if err:=cmd.Start();err!=nil{return err}
 scanner:=bufio.NewScanner(reader);scanner.Buffer(make([]byte,4096),8192)
 for scanner.Scan(){
  if e,ok:=mvxParseEvent(scanner.Text(),id);ok {
   mvxRender([]map[string]any{e},level,component,jsonMode,out)
  }
 }
 if err:=scanner.Err();err!=nil{return err}
 return cmd.Wait()
}
func mvxLocalFollow(ctx context.Context,id string,n int,level,component string,jsonMode bool,out io.Writer)error{
 last:=map[string]bool{}
 for {
  events,err:=mvxEvents(id,n);if err!=nil{return err}
  for _,e:=range events {
   b,_:=json.Marshal(e);key:=string(b)
   if last[key]{continue}
   last[key]=true
   mvxRender([]map[string]any{e},level,component,jsonMode,out)
  }
  if len(last)>4000 {
   last=map[string]bool{}
   for _,e:=range events{b,_:=json.Marshal(e);last[string(b)]=true}
  }
  select{case <-ctx.Done():return nil;case <-time.After(2*time.Second):}
 }
}
func newMVXDiagnosticsCommand()*cobra.Command {
 root:=&cobra.Command{Use:"mvx",Short:"Read structured diagnostics for TUIOS-managed MVX projects"}
 var ssh,level,component string
 var tail int
 var follow,jsonMode bool
 logs:=&cobra.Command{Use:"logs PROJECT_ID",Args:cobra.ExactArgs(1),
  Short:"View per-project log metadata without requiring project HTTP",
  RunE:func(cmd *cobra.Command,args []string)error{
   id:=args[0]
   if err:=registeredMVXProject(id);err!=nil{return err}
   if tail<1||tail>2000{return errors.New("tail must be 1..2000")}
   if ssh!=""{return mvxRemoteEvents(cmd.Context(),ssh,id,tail,follow,level,component,jsonMode,cmd.OutOrStdout())}
   if follow{return mvxLocalFollow(cmd.Context(),id,tail,level,component,jsonMode,cmd.OutOrStdout())}
   events,err:=mvxEvents(id,tail);if err!=nil{return err}
   mvxRender(events,level,component,jsonMode,cmd.OutOrStdout())
   if len(events)==0{fmt.Fprintln(cmd.OutOrStdout(),"NO_EVIDENCE (not proof that the project is healthy)")}
   return nil
  }}
 logs.Flags().StringVar(&ssh,"ssh","","Remote authorized OpenSSH endpoint")
 logs.Flags().StringVar(&level,"level","","Filter INFO/WARN/ERROR/CRITICAL")
 logs.Flags().StringVar(&component,"component","","Filter exact component")
 logs.Flags().IntVar(&tail,"tail",100,"Maximum events 1..2000")
 logs.Flags().BoolVar(&follow,"follow",false,"Follow diagnostic records")
 logs.Flags().BoolVar(&jsonMode,"json",false,"Print allowlisted JSON events")
 root.AddCommand(logs)
 status:=&cobra.Command{Use:"status PROJECT_ID",Args:cobra.ExactArgs(1),
  Short:"Report last observed state, never as a live login claim",
  RunE:func(cmd *cobra.Command,args []string)error{
   if err:=registeredMVXProject(args[0]);err!=nil{return err}
   events,err:=mvxEvents(args[0],200);if err!=nil{return err}
   mvxStatus(events,cmd.OutOrStdout())
   return nil
  }}
 root.AddCommand(status)
 return root
}
