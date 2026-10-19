import React from 'react';
import {Clock3} from 'lucide-react';
import {Input} from './FormField';
import './DurationInput.css';

const pad=value=>String(value).padStart(2,'0');
const format=value=>{
  const total=Math.max(0,Number(value)||0);
  return `${pad(Math.floor(total/3600))}:${pad(Math.floor((total%3600)/60))}:${pad(total%60)}`;
};
const parse=value=>{
  const parts=String(value||'').split(':').map(Number);
  if(parts.length!==3||parts.some(part=>!Number.isInteger(part)||part<0))return null;
  return parts[0]*3600+parts[1]*60+parts[2];
};

export default function DurationInput({value,onChange,disabled=false}){
  return <div className="duration-input"><Clock3 aria-hidden="true"/><Input value={format(value)} disabled={disabled} inputMode="numeric" aria-label="Thời gian giờ phút giây" onChange={event=>{const next=parse(event.target.value);if(next!==null)onChange(next);}}/><span>HH:MM:SS</span></div>;
}
