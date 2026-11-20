import {AsyncLocalStorage} from 'node:async_hooks';
import {performance} from 'node:perf_hooks';

// Request-local measurements only. Never retain packets, identities or credentials.
const context=new AsyncLocalStorage();
export function measureRP(name,run){
 const spans=context.getStore();if(!spans)return run();
 const start=performance.now();
 try{return run();}finally{spans[name]=(spans[name]||0)+performance.now()-start;}
}
export async function captureRPTiming(run){
 const spans={};const value=await context.run(spans,run);
 return {value,spans:Object.fromEntries(Object.entries(spans).map(([k,v])=>[k,Number(v.toFixed(3))]))};
}
