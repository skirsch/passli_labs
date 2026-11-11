import {readFileSync,lstatSync} from 'node:fs';
import {isAbsolute} from 'node:path';
import {decode64,parseWire} from '../../packages/identity-protocol/encoding.mjs';
import {validateNativeIdentityPublicConfiguration} from '../../packages/identity-protocol/configuration.node.mjs';

export function loadNativeRPConfiguration({configurationFile,cookieKeyFile,databasePath,origin}){
 function read(path,secret,max){if(typeof path!=='string'||!isAbsolute(path))throw Error('Absolute RP configuration paths required.');const info=lstatSync(path);if(!info.isFile()||info.isSymbolicLink()||info.size>max||secret&&process.platform!=='win32'&&(info.mode&0o077))throw Error('Bounded protected RP configuration required.');return readFileSync(path,'utf8');}
 const config=validateNativeIdentityPublicConfiguration(parseWire(read(configurationFile,false,65536))),rp=config.sites[origin];
 if(!rp||typeof databasePath!=='string'||!isAbsolute(databasePath)||databasePath===':memory:')throw Error('Configured RP and persistent absolute database path required.');
 const cookieKey=decode64(read(cookieKeyFile,true,128).trim(),32);
 return {path:databasePath,cookieKey,provider:{issuer:config.audience,roots:[config.providerRoot]},policyProvider:{providerOrigin:config.audience,rpPolicy:rp.algorithm,rpAssuranceFor:operation=>rp.assurance[operation]}};
}
