import {canonical,fields,site} from './encoding.mjs';
import {validateAlgorithmPolicy} from './algorithm-policy.mjs';
import {validateAssurance} from './schema.mjs';
import {validateDescriptor} from './crypto.node.mjs';
const rpPolicyOperations=['login','create_account','link','unlink','rekey','resume'];
export function validateNativeIdentityPublicConfiguration(config){
 fields(config,['format','audience','factorOrigin','factorRPID','providerRoot','userAlgorithm','passliAlgorithm','passliAssurance','sites']);
 if(config.format!=='passli.native-identity-configuration.v1')throw Error('Unsupported native identity configuration.');
 site(config.audience);site(config.factorOrigin);if(new URL(config.factorOrigin).hostname!==config.factorRPID)throw Error('Matching factor RP ID required.');
 validateAlgorithmPolicy(config.userAlgorithm);validateAlgorithmPolicy(config.passliAlgorithm);
 if(!config.sites||!Object.keys(config.sites).length)throw Error('Explicit RP policies required.');
 function assurances(value){fields(value,rpPolicyOperations);for(const p of Object.values(value)){validateAssurance(p);if(p.requiredLevel!==p.achievedLevel||p.factors.includes('additional-method'))throw Error('Unsupported assurance requirement.');}}
 assurances(config.passliAssurance);
 for(const [origin,value]of Object.entries(config.sites)){site(origin);fields(value,['algorithm','assurance']);validateAlgorithmPolicy(value.algorithm);assurances(value.assurance);}
 validateDescriptor(config.providerRoot,'provider');
 if(config.providerRoot.role!=='provider'||config.providerRoot.algorithm!=='ML-DSA-87-pure-over-SHA256')throw Error('ML-DSA-87 enrollment root required.');
 return JSON.parse(canonical(config));
}
