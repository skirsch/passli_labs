import {canonical,decode64,fields,reject} from './encoding.mjs';
export const personalFields=['name','email','phone'];
export function personalInformationValue(value){
 fields(value,['salt','values']);decode64(value.salt,32);
 if(!value.values||typeof value.values!=='object'||Array.isArray(value.values)||Object.keys(value.values).some(k=>!personalFields.includes(k)))reject('IDENTITY_DISCLOSURE_INVALID');
 for(const v of Object.values(value.values))if(typeof v!=='string'||!v.trim()||v.length>2048)reject('IDENTITY_DISCLOSURE_INVALID');
 return {domain:'passli:rp-personal-information:v1',...JSON.parse(canonical(value))};
}
export function assertPersonalInformation(transaction,value,digest){
 const expected=transaction.context.personalInformationDigest;
 if(!expected){if(value!==undefined&&value!==null)reject('IDENTITY_DISCLOSURE_UNREQUESTED');return;}
 if(!['create_account','login','link'].includes(transaction.operation)||digest(personalInformationValue(value))!==expected)reject('IDENTITY_DISCLOSURE_MISMATCH');
}
