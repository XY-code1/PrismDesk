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
