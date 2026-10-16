import WebSocket from 'ws';

export type CdpTarget = { id:string; type:string; title:string; url:string; webSocketDebuggerUrl:string };
export async function targets(port:number):Promise<CdpTarget[]> {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('无效 CDP 端口');
  const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1500), redirect:'error' });
  if (!response.ok) throw new Error(`CDP HTTP ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error('CDP 响应无效');
  return data;
}
export async function evaluate(wsUrl:string, expression:string):Promise<unknown> {
  const url = new URL(wsUrl);
  if (url.protocol !== 'ws:' || url.hostname !== '127.0.0.1' || !url.port) throw new Error('拒绝非回环 CDP');
  return new Promise((resolve,reject) => {
    const ws = new WebSocket(wsUrl); const timer=setTimeout(()=>{ws.terminate();reject(new Error('CDP 超时'));},5000);
    ws.once('error', reject); ws.once('open',()=>ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}})));
    ws.on('message', raw => { const msg=JSON.parse(String(raw)); if(msg.id!==1)return; clearTimeout(timer); ws.close(); if(msg.error||msg.result?.exceptionDetails) reject(new Error(msg.error?.message||msg.result.exceptionDetails.text)); else resolve(msg.result?.result?.value); });
  });
}
export async function command(wsUrl:string, method:string, params:Record<string,unknown>={}):Promise<any> {
  const url=new URL(wsUrl); if(url.protocol!=='ws:'||url.hostname!=='127.0.0.1') throw new Error('拒绝非回环 CDP');
  return new Promise((resolve,reject)=>{const ws=new WebSocket(wsUrl);const timer=setTimeout(()=>{ws.terminate();reject(new Error('CDP 超时'));},5000);ws.once('error',reject);ws.once('open',()=>ws.send(JSON.stringify({id:1,method,params})));ws.on('message',r=>{const m=JSON.parse(String(r));if(m.id!==1)return;clearTimeout(timer);ws.close();m.error?reject(new Error(m.error.message)):resolve(m.result);});});
}

// A long-lived page connection, used by the in-client pet control loop. The loop evaluates once per
// tick and would otherwise open (and close) a WebSocket about once per second per client.
export class CdpSession {
  private readonly pending=new Map<number,{ resolve:(value:unknown)=>void; reject:(error:Error)=>void; timer:ReturnType<typeof setTimeout> }>();
  private seq=0; private closed=false;
  private constructor(private readonly ws:WebSocket, private readonly onClose:(()=>void)|null){}

  static open(wsUrl:string, onClose?:(()=>void)|null):Promise<CdpSession> {
    const url=new URL(wsUrl);
    if(url.protocol!=='ws:'||url.hostname!=='127.0.0.1'||!url.port) return Promise.reject(new Error('拒绝非回环 CDP'));
    return new Promise((resolve,reject)=>{
      const ws=new WebSocket(wsUrl);
      const timer=setTimeout(()=>{ws.terminate();reject(new Error('CDP 连接超时'))},4000);
      const fail=(error:Error)=>{clearTimeout(timer);ws.terminate();reject(error)};
      ws.once('error',fail);
      ws.once('open',()=>{
        clearTimeout(timer);ws.off('error',fail);
        const session=new CdpSession(ws,onClose??null);
        ws.on('message',raw=>session.handle(raw));
        ws.on('close',()=>session.finish());
        ws.on('error',()=>session.finish());
        resolve(session);
      });
    });
  }

  get open(){return !this.closed&&this.ws.readyState===WebSocket.OPEN}

  evaluate(expression:string, timeoutMs=4000):Promise<unknown> {
    if(this.closed) return Promise.reject(new Error('CDP 会话已关闭'));
    const id=++this.seq;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('CDP 超时'))},timeoutMs);
      this.pending.set(id,{ resolve, reject, timer });
      try{ this.ws.send(JSON.stringify({ id, method:'Runtime.evaluate', params:{ expression, awaitPromise:true, returnByValue:true } })) }
      catch(error){ clearTimeout(timer); this.pending.delete(id); reject(error as Error) }
    });
  }

  close(){ this.finish() }

  handle(raw:WebSocket.RawData){
    let message:any;
    try{ message=JSON.parse(String(raw)) }catch(error){ return }
    if(typeof message?.id!=='number') return;
    const entry=this.pending.get(message.id);
    if(!entry) return;
    this.pending.delete(message.id);
    clearTimeout(entry.timer);
    const detail=message.error?.message??message.result?.exceptionDetails?.text;
    if(detail) entry.reject(new Error(String(detail)));
    else entry.resolve(message.result?.result?.value);
  }

  private finish(){
    if(this.closed) return;
    this.closed=true;
    for(const entry of this.pending.values()){clearTimeout(entry.timer);entry.reject(new Error('CDP 会话已关闭'))}
    this.pending.clear();
    try{ this.ws.terminate() }catch(error){}
    this.onClose?.();
  }
}
