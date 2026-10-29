import QRCode from './vendor/qr-encoder.mjs';
export function qrSvg(value){
 const {modules}=QRCode.create(value,{errorCorrectionLevel:'M'}),margin=4,size=modules.size+margin*2,paths=[];
 for(let y=0;y<modules.size;y++)for(let x=0;x<modules.size;){if(!modules.get(y,x)){x++;continue;}const start=x;while(x<modules.size&&modules.get(y,x))x++;const width=x-start;paths.push(`M${start+margin} ${y+margin}h${width}v1h-${width}z`);}
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="300" height="300" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path fill="black" d="${paths.join('')}"/></svg>`;
}
