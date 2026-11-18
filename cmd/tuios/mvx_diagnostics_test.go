package main

import (
 "bytes"
 "strings"
 "testing"
)
func TestMVXProjectIDAndSSHValidation(t *testing.T){
 if err:=validateMVXID("mvx-light-monitor");err!=nil{t.Fatal(err)}
 for _,s:=range []string{"../vault","evil;rm -rf","UPPER","", "a"}{
  if err:=validateMVXID(s);err==nil{t.Errorf("accepted %q",s)}
 }
 if _,err:=mvxRemoteCommand("bad;command","mvx-light-monitor",100,false);err==nil{
  t.Fatal("SSH injection accepted")
 }
 if _,err:=mvxRemoteCommand("Deglu@mini-pc1","mvx-light-monitor",100,false);err!=nil{t.Fatal(err)}
}
func TestMVXDiagnosticParserRejectsSecretsAndCrossProject(t *testing.T){
 sample:=`{"schema":"mvx.tuios.diagnostic.v1","projectId":"mvx-ide-taurus","time":"2026-11-18T13:00:00Z","component":"vite.compiler","event":"reported_failure","level":"ERROR","errorCode":"MODULE_NOT_FOUND","message":"Bearer supersecret","result":"failed"}`
 event,ok:=mvxParseEvent(sample,"mvx-ide-taurus")
 if !ok {t.Fatal("valid event rejected")}
 if _,found:=event["message"];found{t.Fatal("raw log message retained")}
 if _,ok:=mvxParseEvent(sample,"mvx-light-monitor");ok{t.Fatal("cross-project event accepted")}
 bad:=`{"schema":"mvx.tuios.diagnostic.v1","projectId":"mvx-ide-taurus","time":"2026-11-18T13:00:00Z","event":"error","result":"token=secret"}`
 event,ok=mvxParseEvent(bad,"mvx-ide-taurus")
 if !ok{t.Fatal("valid envelope rejected")}
 if _,found:=event["result"];found{t.Fatal("sensitive result escaped allowlist")}
}
func TestMVXRecordedStateDoesNotClaimLiveAuth(t *testing.T){
 entries:=[]map[string]any{
  {"time":"2026-11-18T13:00:00Z","level":"INFO","component":"runtime","event":"http_readiness_verified"},
  {"time":"2026-11-18T13:01:00Z","level":"CRITICAL","component":"dpapi","event":"decrypt_failed","errorCode":"DPAPI_ERROR"},
 }
 var buffer bytes.Buffer
 mvxStatus(entries,&buffer)
 if !strings.Contains(buffer.String(),"NOT_READY"){t.Fatal(buffer.String())}
 if !strings.Contains(buffer.String(),"not live authenticated readiness"){t.Fatal(buffer.String())}
 buffer.Reset()
 mvxStatus(nil,&buffer)
 if !strings.Contains(buffer.String(),"NO_EVIDENCE"){t.Fatal(buffer.String())}
}
func TestMVXCLIRegistered(t *testing.T){
 cmd,_,err:=newRootCommand().Find([]string{"mvx","logs","mvx-ide-taurus"})
 if err!=nil||cmd==nil||cmd.Name()!="logs"{t.Fatalf("missing MVX command: %v",err)}
}
