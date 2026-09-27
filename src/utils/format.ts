export const n = (v: number, digits = 1) => v.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const money = (v: number) => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(v);
export const time = (v: string) => new Date(v).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
