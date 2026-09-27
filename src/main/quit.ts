// One bounded quit transaction is shared by the window, tray and injected-panel exits.
// Cleanup failure must never strand the desktop pet or the Electron process.
export async function finishQuit(cleanup:()=>Promise<unknown>, finalize:()=>void, timeoutMs=5000):Promise<void>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
    await Promise.race([
      cleanup().catch(()=>undefined),
      new Promise<void>(resolve=>{timer=setTimeout(resolve,timeoutMs)}),
    ]);
  }finally{
    if(timer)clearTimeout(timer);
    finalize();
  }
}
