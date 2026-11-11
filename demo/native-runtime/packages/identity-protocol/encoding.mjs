// Platform-neutral wire primitives. No private material is included in errors.
export function reject(code='IDENTITY_PROTOCOL_INVALID') {
  throw Object.assign(new Error('Invalid identity protocol input.'), {code, status:400});
}
const utf8=new TextEncoder();
export const bytes=value=>utf8.encode(value);
export function text(value,max=4096) {
  if(typeof value!=='string'||value.length>max||/[\u0000-\u001f\u007f]/u.test(value))reject();
  for(let i=0;i<value.length;i++) {
    const c=value.charCodeAt(i);
    if(c>=0xd800&&c<=0xdbff){const d=value.charCodeAt(++i);if(!(d>=0xdc00&&d<=0xdfff))reject();}
    else if(c>=0xdc00&&c<=0xdfff)reject();
  }
  return value;
}
export function fields(value,keys) {
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))reject();
  const actual=Reflect.ownKeys(value);
  if(actual.length!==keys.length||actual.some(k=>typeof k!=='string'||!keys.includes(k)||!Object.getOwnPropertyDescriptor(value,k)?.enumerable||!('value' in Object.getOwnPropertyDescriptor(value,k))))reject();
  return value;
}
export function canonical(value) {
  let count=0;
  function encode(v,depth) {
    if(depth>24||++count>10000)reject();
    if(v===null||typeof v==='boolean')return JSON.stringify(v);
    if(typeof v==='string')return JSON.stringify(text(v,262144));
    if(typeof v==='number'){if(!Number.isSafeInteger(v)||Object.is(v,-0))reject();return String(v);}
    if(Array.isArray(v)){
      if(Reflect.ownKeys(v).length!==v.length+1)reject();
      return '['+Array.from({length:v.length},(_,i)=>{const p=Object.getOwnPropertyDescriptor(v,String(i));if(!p||!('value'in p))reject();return encode(p.value,depth+1);}).join(',')+']';
    }
    if(!v||typeof v!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(v)))reject();
    const keys=Reflect.ownKeys(v);if(keys.some(k=>typeof k!=='string'))reject();
    return '{'+keys.sort().map(k=>{text(k);if(['__proto__','constructor','prototype'].includes(k))reject();const p=Object.getOwnPropertyDescriptor(v,k);if(!p.enumerable||!('value'in p))reject();return JSON.stringify(k)+':'+encode(p.value,depth+1);}).join(',')+'}';
  }
  const result=encode(value,0);if(bytes(result).length>262144)reject();return result;
}

// JSON.parse alone discards duplicate properties, including escaped duplicates.
export function parseWire(input) {
  if(typeof input!=='string'||bytes(input).length>262144)reject();
  let at=0,count=0;
  const ws=()=>{while(/[\x20\t\r\n]/.test(input[at]||'x'))at++;};
  function string(){const start=at++;let escaped=false;while(at<input.length){const c=input[at++];if(c==='"'&&!escaped){let result;try{result=JSON.parse(input.slice(start,at));}catch{reject();}return text(result,262144);}if(c==='\\'&&!escaped)escaped=true;else escaped=false;}reject();}
  function value(depth){
    if(depth>24||++count>10000)reject();ws();const c=input[at];
    if(c==='"')return string();
    if(c==='{'||c==='['){const object=c==='{',end=object?'}':']',result=object?Object.create(null):[],seen=new Set();at++;ws();if(input[at]===end){at++;return result;}
      while(true){ws();let key;if(object){if(input[at]!=='"')reject();key=string();if(seen.has(key)||['__proto__','constructor','prototype'].includes(key))reject();seen.add(key);ws();if(input[at++]!==':')reject();}const item=value(depth+1);if(object)result[key]=item;else result.push(item);ws();if(input[at]===end){at++;return result;}if(input[at++]!==',')reject();}
    }
    for(const [word,result]of [['true',true],['false',false],['null',null]])if(input.startsWith(word,at)){at+=word.length;return result;}
    const match=/^-?(?:0|[1-9]\d*)/.exec(input.slice(at));if(!match)reject();at+=match[0].length;const n=Number(match[0]);if(!Number.isSafeInteger(n)||Object.is(n,-0))reject();return n;
  }
  const result=value(0);ws();if(at!==input.length)reject();canonical(result);return result;
}
export function encode64(input){if(!(input instanceof Uint8Array))reject();let s='';for(const b of input)s+=String.fromCharCode(b);return btoa(s).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
export function decode64(input,length){if(typeof input!=='string'||!/^[A-Za-z0-9_-]+$/.test(input)||input.length>262144)reject();let out;try{out=Uint8Array.from(atob(input.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));}catch{reject();}if(encode64(out)!==input||length!==undefined&&out.length!==length)reject();return out;}
export function revision(value){if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(value)||BigInt(value)>18446744073709551615n)reject();return value;}
export function nextRevision(value){revision(value);const n=(BigInt(value)+1n).toString();return revision(n);}
export function accountID(value){if(typeof value!=='string'||!/^[0-9a-f]{16}$/.test(value))reject();return value;}
export function canonicalSite(value){text(value);let u;try{u=new URL(value);}catch{reject();}if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/'||u.origin==='null')reject();return u.origin;}
export function site(value){if(canonicalSite(value)!==value)reject();return value;}
export async function hash(value){return encode64(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes(canonical(value)))));}
