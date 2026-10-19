const pad=value=>String(value).padStart(2,'0');
function formatParts(day,month,year){day=Number(day);month=Number(month);year=Number(year);const date=new Date(Date.UTC(year,month-1,day));return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day?`${pad(day)}/${pad(month)}/${year}`:null;}
function parseSingleDate(value,xlsx=null){
  if(value===null||value===undefined||value==='')return null;
  if(typeof value==='number'){const parts=xlsx?.SSF?.parse_date_code(value);return parts?formatParts(parts.d,parts.m,parts.y):null;}
  if(value instanceof Date&&!Number.isNaN(value.getTime()))return formatParts(value.getUTCDate(),value.getUTCMonth()+1,value.getUTCFullYear());
  const text=String(value).trim();let match=text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(match)return formatParts(match[1],match[2],match[3]);
  match=text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);return match?formatParts(match[3],match[2],match[1]):null;
}
const timestamp=value=>{const [day,month,year]=value.split('/').map(Number);return Date.UTC(year,month-1,day);};
function parseDeploymentDate(value,xlsx=null){
  const single=parseSingleDate(value,xlsx);if(single)return single;if(typeof value!=='string')return null;
  const text=value.trim();
  if(text.includes(';')){const dates=text.split(';').map(item=>parseSingleDate(item,xlsx));if(dates.some(date=>!date))return null;const unique=[...new Set(dates)].sort((a,b)=>timestamp(a)-timestamp(b));return unique.length===dates.length&&unique.length>1?unique.join('; '):null;}
  const range=text.match(/^(.+?)\s+(?:-|–|—)\s+(.+)$/);if(!range)return null;
  const start=parseSingleDate(range[1],xlsx),end=parseSingleDate(range[2],xlsx);return start&&end&&timestamp(start)<=timestamp(end)?`${start} - ${end}`:null;
}
function deploymentDayCount(value){const parsed=parseDeploymentDate(value);if(!parsed)return null;if(parsed.includes(';'))return parsed.split(';').length;if(parsed.includes(' - ')){const [start,end]=parsed.split(' - ');return Math.floor((timestamp(end)-timestamp(start))/86400000)+1;}return 1;}
module.exports={parseSingleDate,parseDeploymentDate,deploymentDayCount};
