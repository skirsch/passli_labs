// Generated from Passli scripts/fedcm/approval-labels.mjs (approvalLabelScript).
const approvalNames=["Device key","Security key","Mobile app","Face ID","Face ID+"];function approvalLabel(value) {
 const number = typeof value === 'string' && /^[1-5]$/.test(value) ? Number(value) : value;
 return Number.isInteger(number) && number >= 1 && number <= 5 ? approvalNames[number - 1] : 'Unsupported approval requirement';
}
export {approvalLabel};
