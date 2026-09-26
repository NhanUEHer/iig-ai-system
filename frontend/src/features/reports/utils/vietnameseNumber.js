export function parseVietnameseNumber(raw,{allowIncomplete=false}={}) {
  const text=String(raw??'').trim().replace(/\s/g,'');
  if(!text)return null;
  const cleaned=text.replace(/[^0-9,.-]/g,'');
  if(cleaned!==text)return null;
  if(allowIncomplete&&(
    /^-?\d{1,3}(?:\.\d{3})*\.\d{0,2}$/.test(cleaned)||
    /^-?(?:\d{1,3}(?:\.\d{3})*|\d+),$/.test(cleaned)
  ))return undefined;
  if(!/^-?[\d.,]+$/.test(cleaned))return null;
  const unsigned=cleaned.replace('-','');
  const commas=(unsigned.match(/,/g)||[]).length;
  const dots=(unsigned.match(/\./g)||[]).length;
  let normalized;
  if(commas&&dots){const decimal=unsigned.lastIndexOf(',')>unsigned.lastIndexOf('.')?',':'.';const grouped=decimal===','?'.':',';normalized=cleaned.replaceAll(grouped,'').replace(decimal,'.');}
  else if(commas>1||dots>1){const separator=commas?',':'.';const parts=unsigned.split(separator);if(parts.slice(1).some(part=>!/^\d{3}$/.test(part)))return null;normalized=cleaned.replaceAll(separator,'');}
  else if(commas===1||dots===1){const separator=commas?',':'.';const [integer,fraction]=unsigned.split(separator);if(!integer||!fraction)return allowIncomplete?undefined:null;normalized=fraction.length===3&&!/^0\d*$/.test(integer)?cleaned.replace(separator,''):cleaned.replace(separator,'.');}
  else normalized=cleaned;
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
