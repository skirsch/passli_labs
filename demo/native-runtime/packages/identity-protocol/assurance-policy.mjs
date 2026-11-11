import {revision,reject} from './encoding.mjs';
import {validateAssurance} from './schema.mjs';

// A per-request RP choice raises minima; it never edits user/provider policy.
export function requestedAssurance(base,level=1){
 validateAssurance(base);if(!Number.isInteger(level)||level<1||level>4)reject('IDENTITY_POLICY_INVALID');
 const requiredLevel=Math.max(base.requiredLevel,level),extra=level===1?[]:level===2?['security-key']:level===3?['mobile-approval']:['mobile-approval','fresh-biometric','security-key'];
 const factors=[...base.factors,...extra.filter(f=>!base.factors.includes(f))];
 const result={...base,requiredLevel,achievedLevel:requiredLevel,factors};validateAssurance(result);return result;
}
export function validateRequestedAssurance(base,requested){
 validateAssurance(base);validateAssurance(requested);
 if(requested.policyRevision!==base.policyRevision||requested.requiredLevel<base.requiredLevel||requested.achievedLevel!==requested.requiredLevel||base.factors.some(f=>!requested.factors.includes(f))||requested.factors.includes('additional-method')&&!base.factors.includes('additional-method'))reject('IDENTITY_POLICY_CHANGED');
 return requested;
}

// Requirements compose by union, not by a numeric level alone: Security key
// at level 2 must not disappear when a different party requires phone approval.
export function combineAssurancePolicies(policies){
 if(!Array.isArray(policies)||!policies.length)reject('IDENTITY_POLICY_INVALID');
 for(const policy of policies){validateAssurance(policy);if(policy.requiredLevel!==policy.achievedLevel)reject('IDENTITY_POLICY_INVALID');}
 const level=Math.max(...policies.map(p=>p.requiredLevel));
 const factors=['registered-device','security-key','mobile-approval','fresh-biometric','additional-method'].filter(f=>policies.some(p=>p.factors.includes(f)));
 // Each constituent revision is monotonic. Their checked sum advances whenever
 // any constituent changes; overflow fails closed instead of wrapping.
 const policyRevision=revision(policies.reduce((n,p)=>n+BigInt(p.policyRevision),0n).toString());
 const combined={schema:'passli:loa:four:v1',requiredLevel:level,achievedLevel:level,factors,policyRevision};
 validateAssurance(combined);return combined;
}
