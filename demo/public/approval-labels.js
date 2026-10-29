// Generated from Passli scripts/fedcm/approval-labels.mjs (approvalLabelScript).
const approvalNames=["1 · Device key","2 · Security key","3 · Mobile app","4 · Face ID","5 · Face ID+"];function approvalLabel(value) {
 const number = typeof value === 'string' && /^[1-5]$/.test(value) ? Number(value) : value;
 return Number.isInteger(number) && number >= 1 && number <= 5 ? approvalNames[number - 1] : 'Unsupported approval level';
}
export {approvalLabel};
