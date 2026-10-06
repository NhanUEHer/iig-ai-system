export function parseVietnameseNumber(raw,{allowIncomplete=false}={}) {
  const text=String(raw??'').trim().replace(/\s/g,'');
  if(!text)return null;
  const cleaned=text.replace(/[^0-9,.-]/g,'');
  if(cleaned!==text)return null;
  if(allowIncomplete&&(
    /^-?\d{1,3}(?:\.\d{3})*\.\d{0,2}$/.test(cleaned)||
    /^-?(?:\d{1,3}(?:\.\d{3})*|\d+),$/.test(cleaned)
  ))return undefined;
  if(!/^-?(?:\d{1,3}(?:\.\d{3})*|\d+)(?:,\d+)?$/.test(cleaned))return null;
  const normalized=cleaned.replaceAll('.','').replace(',','.');
  return Number.isFinite(Number(normalized))?normalized:null;
}

export function formatVietnameseNumber(value) {
  if(value===null||value===undefined||value==='')return '';
  const normalized=String(value).replace(',','.');
  if(!/^-?\d+(?:\.\d+)?$/.test(normalized))return String(value);
  const [rawInteger,rawFraction='']=normalized.split('.');
  const sign=rawInteger.startsWith('-')?'-':'';
  const integer=rawInteger.replace('-','').replace(/^0+(?=\d)/,'').replace(/\B(?=(\d{3})+(?!\d))/g,'.');
  const fraction=/^0*$/.test(rawFraction)?'':rawFraction;
  return `${sign}${integer}${fraction?`,${fraction}`:''}`;
}
