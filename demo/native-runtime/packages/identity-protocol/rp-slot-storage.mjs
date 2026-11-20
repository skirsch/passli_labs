import {isRPKey} from './key-slots.mjs';

// Trusted local storage only. Never apply this to a received transaction or
// proof: signed payloads must remain byte-for-byte intact.
export function rpSlotDescriptor(key){
 if(!isRPKey(key)||!Object.hasOwn(key,'keyID'))return key;
 const {keyID,...descriptor}=key;return descriptor;
}
export function rpSlotBinding(binding){
 return binding?.keys?{...binding,keys:binding.keys.map(rpSlotDescriptor)}:binding;
}
export function rpSlotLocalState(state){
 if(!state)return state;
 const copy={...state};
 for(const field of ['userKey','cloudKey','independentKey'])if(copy[field])copy[field]=rpSlotDescriptor(copy[field]);
 if(copy.binding)copy.binding=rpSlotLocalState(copy.binding);
 if(copy.committed)copy.committed=rpSlotBinding(copy.committed);
 if(copy.replacement)copy.replacement=rpSlotLocalState(copy.replacement);
 return copy;
}
