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
export function validateAlgorithmPolicy(policy){
  fields(policy,['minimumProfile','allowedAlgorithms','revision']);
  if(!profiles.includes(policy.minimumProfile))reject('IDENTITY_ALGORITHM_POLICY_INVALID');list(policy.allowedAlgorithms);revision(policy.revision);return policy;
}
export function validateAlgorithmPolicies(policies){fields(policies,['user','rp','passli']);for(const p of Object.values(policies))validateAlgorithmPolicy(p);return policies;}
function eligible(algorithm,policies){
  const index=algorithms.indexOf(algorithm);
  return index>=0&&Object.values(policies).every(p=>p.allowedAlgorithms.includes(algorithm)&&index>=profiles.indexOf(p.minimumProfile));
}
export function algorithmBinding(algorithm,policies){
  validateAlgorithmPolicies(policies);
  if(!eligible(algorithm,policies))reject('IDENTITY_REKEY_REQUIRED');
  return {selectedAlgorithm:algorithm,policies:JSON.parse(canonical(policies))};
}
export function validateAlgorithmBinding(binding){fields(binding,['selectedAlgorithm','policies']);algorithmBinding(binding.selectedAlgorithm,binding.policies);return binding;}
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
