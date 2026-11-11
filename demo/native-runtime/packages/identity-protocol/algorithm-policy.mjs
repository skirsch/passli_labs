import {canonical,fields,reject,revision} from './encoding.mjs';

export const profileAlgorithms=Object.freeze({
  'classical-128':'Ed25519-over-SHA256',
  'ml-dsa-44':'ML-DSA-44-pure-over-SHA256',
  'ml-dsa-65':'ML-DSA-65-pure-over-SHA256',
  'ml-dsa-87':'ML-DSA-87-pure-over-SHA256',
});
const profiles=Object.keys(profileAlgorithms),algorithms=Object.values(profileAlgorithms);
// This is a product eligibility policy, not a numeric comparison of ECC and
// lattice key sizes, nor a claim that SHA-256 gives category-5 transcript security.
function list(value){if(!Array.isArray(value)||!value.length||new Set(value).size!==value.length||value.some(v=>!algorithms.includes(v)))reject('IDENTITY_ALGORITHM_POLICY_INVALID');}
export const signingRoles=['user','cloud','independent'];
export function roleAlgorithm(binding,role){return binding.selectedAlgorithms?.[role]??binding.selectedAlgorithm;}
export function validateAlgorithmPolicy(policy){
  fields(policy,['minimumProfile','allowedAlgorithms','revision',...(policy.roles?['roles']:[])]);
  if(!profiles.includes(policy.minimumProfile))reject('IDENTITY_ALGORITHM_POLICY_INVALID');list(policy.allowedAlgorithms);revision(policy.revision);
  if(policy.roles){fields(policy.roles,signingRoles);for(const p of Object.values(policy.roles)){if(p.roles)reject('IDENTITY_ALGORITHM_POLICY_INVALID');validateAlgorithmPolicy(p);}}return policy;
}
export function validateAlgorithmPolicies(policies){fields(policies,['user','rp','passli']);for(const p of Object.values(policies))validateAlgorithmPolicy(p);return policies;}
function eligible(algorithm,policies,role){
  const index=algorithms.indexOf(algorithm);
  return index>=0&&Object.values(policies).every(policy=>{const p=policy.roles?.[role]??policy;return p.allowedAlgorithms.includes(algorithm)&&index>=profiles.indexOf(p.minimumProfile);});
}
export function algorithmBinding(algorithm,policies){
  validateAlgorithmPolicies(policies);
  if(typeof algorithm==='object'&&algorithm){fields(algorithm,signingRoles);for(const role of signingRoles)if(!eligible(algorithm[role],policies,role))reject('IDENTITY_REKEY_REQUIRED');return {selectedAlgorithms:JSON.parse(canonical(algorithm)),policies:JSON.parse(canonical(policies))};}
  if(!eligible(algorithm,policies))reject('IDENTITY_REKEY_REQUIRED');
  return {selectedAlgorithm:algorithm,policies:JSON.parse(canonical(policies))};
}
export function validateAlgorithmBinding(binding){fields(binding,[binding.selectedAlgorithms?'selectedAlgorithms':'selectedAlgorithm','policies']);algorithmBinding(binding.selectedAlgorithms??binding.selectedAlgorithm,binding.policies);return binding;}
export function negotiateRoleAlgorithms(policies,capabilities,requested={}){
  validateAlgorithmPolicies(policies);fields(capabilities,signingRoles);const selected={};
  for(const role of signingRoles){list(capabilities[role]);const choices=requested[role]?[requested[role]]:algorithms;list(choices);selected[role]=choices.find(a=>eligible(a,policies,role)&&capabilities[role].includes(a));if(!selected[role])reject('IDENTITY_ALGORITHM_UNSUPPORTED');}
  return algorithmBinding(selected,policies);
}
export function negotiateAlgorithm(policies,capabilities){
  validateAlgorithmPolicies(policies);fields(capabilities,['user','cloud','rp']);Object.values(capabilities).forEach(list);
  const selected=algorithms.find(a=>eligible(a,policies)&&Object.values(capabilities).every(s=>s.includes(a)));
  if(!selected)reject('IDENTITY_ALGORITHM_UNSUPPORTED');return algorithmBinding(selected,policies);
}
export function assertCurrentAlgorithmPolicy(binding,currentPolicies){
  validateAlgorithmBinding(binding);validateAlgorithmPolicies(currentPolicies);
  if(canonical(binding.policies)!==canonical(currentPolicies))reject('IDENTITY_ALGORITHM_POLICY_CHANGED');
  return binding;
}
