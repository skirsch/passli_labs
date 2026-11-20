// RP roles are the wire names for slots 1, 2 and 3. Other key namespaces
// retain their existing lifecycle identifiers.
export const rpKeySlots=Object.freeze({user:1,cloud:2,independent:3});
export const isRPKey=key=>Object.hasOwn(rpKeySlots,key?.role);
export const keyReference=key=>isRPKey(key)?{role:key.role}:{role:key.role,keyID:key.keyID};
export const proofFields=key=>isRPKey(key)?['role','signature']:['role','keyID','signature'];
export const descriptorFields=key=>isRPKey(key)?['role','algorithm','publicKey']:['role','algorithm','publicKey','keyID'];
