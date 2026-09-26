import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react';
import './date-time.css';
import './date-time-overrides.css';
import './time-picker-overrides.css';

function toDateValue(value) { return value ? new Date(value) : null; }
function formatDate(value, includeTime = false) { const date = toDateValue(value); if (!date || Number.isNaN(date.getTime())) return ''; return new Intl.DateTimeFormat('vi-VN', includeTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' }).format(date); }

export function Calendar({ value, onChange, minDate, maxDate, rangeStart, rangeEnd, onRangeChange }) {
  const selected = toDateValue(value); const month = selected || new Date(); const first = new Date(month.getFullYear(), month.getMonth(), 1); const startDay = (first.getDay() + 6) % 7; const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((startDay + days) / 7) * 7 }, (_, index) => { const day = index - startDay + 1; return day > 0 && day <= days ? new Date(month.getFullYear(), month.getMonth(), day) : null; });
  const changeMonth = amount => onChange?.(new Date(month.getFullYear(), month.getMonth() + amount, 1).toISOString());
  const disabled = date => (minDate && date < new Date(minDate)) || (maxDate && date > new Date(maxDate));
  return <div className="ui-calendar"><div className="ui-calendar__header"><button type="button" onClick={() => changeMonth(-1)} aria-label="Tháng trước">‹</button><strong>{new Intl.DateTimeFormat('vi-VN', { month: 'long', year: 'numeric' }).format(month)}</strong><button type="button" onClick={() => changeMonth(1)} aria-label="Tháng sau">›</button></div><div className="ui-calendar__weekdays">{['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(day => <span key={day}>{day}</span>)}</div><div className="ui-calendar__days">{cells.map((date, index) => { const active = date && selected && date.toDateString() === selected.toDateString(); const inRange = date && rangeStart && rangeEnd && date >= new Date(rangeStart) && date <= new Date(rangeEnd); return <button type="button" key={index} className={`${active ? 'is-active ' : ''}${inRange ? 'is-range' : ''}`} disabled={!date || disabled(date)} onClick={() => date && (onRangeChange ? onRangeChange(date.toISOString()) : onChange?.(date.toISOString()))}>{date?.getDate()}</button>; })}</div></div>;
}

export function CalendarPopup({ open, value, onChange, minDate, maxDate, onClose }) { if (!open) return null; return <div className="ui-calendar-popup"><Calendar value={value} onChange={onChange} minDate={minDate} maxDate={maxDate} /><div className="ui-calendar-popup__footer"><button type="button" onClick={() => onChange?.(new Date().toISOString())}>Hôm nay</button><button type="button" onClick={onClose}>Đóng</button></div></div>; }

export function DatePicker({ value, onChange, label, minDate, maxDate, disabled = false, error }) {
  const [open, setOpen] = useState(false);
  return <div className={`ui-date-field ui-date-picker${error ? ' has-error' : ''}`}>
    {label && <span>{label}</span>}
    <div className="ui-date-picker__control">
      <button type="button" className="ui-date-picker__trigger" disabled={disabled} onClick={() => setOpen(!open)} aria-haspopup="dialog" aria-expanded={open}><span>{formatDate(value) || 'Chọn ngày'}</span><span aria-hidden="true">▣</span></button>
      {open && <CalendarPopup open value={value} minDate={minDate} maxDate={maxDate} onChange={selected => { onChange?.(selected); setOpen(false); }} onClose={() => setOpen(false)} />}
    </div>
    {error && <small>{error}</small>}
  </div>;
}

export function DateRangePicker({ startDate, endDate, onChange, label, minDate, maxDate }) {
  const [open, setOpen] = useState(false); const [draftStart, setDraftStart] = useState(startDate); const [draftEnd, setDraftEnd] = useState(endDate);
  const choose = value => { if (!draftStart || draftEnd) { setDraftStart(value); setDraftEnd(''); } else { const first = new Date(draftStart) <= new Date(value) ? draftStart : value; const last = first === draftStart ? value : draftStart; setDraftStart(first); setDraftEnd(last); onChange?.({ startDate: first, endDate: last }); setOpen(false); } };
  return <div className="ui-date-range"><span>{label}</span><div className="ui-date-range__control"><button type="button" className="ui-date-picker__trigger" onClick={() => { setDraftStart(startDate); setDraftEnd(endDate); setOpen(!open); }} aria-haspopup="dialog" aria-expanded={open}><span>{startDate && endDate ? `${formatDate(startDate)} – ${formatDate(endDate)}` : 'Chọn khoảng ngày'}</span><span aria-hidden="true">▣</span></button>{open && <div className="ui-range-popup"><Calendar value={draftStart} onChange={choose} minDate={minDate} maxDate={maxDate} rangeStart={draftStart} rangeEnd={draftEnd} /><div className="ui-calendar-popup__footer"><button type="button" onClick={() => { setDraftStart(''); setDraftEnd(''); onChange?.({ startDate: '', endDate: '' }); }}>Xóa</button><button type="button" onClick={() => setOpen(false)}>Đóng</button></div></div>}</div></div>;
}

export function TimePicker({ value, onChange, label, disabled = false, minuteStep = 30 }) {
  const [open, setOpen] = useState(false);
  const times = Array.from({ length: Math.ceil(24 * 60 / minuteStep) }, (_, index) => { const minutes = index * minuteStep; return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`; });
  return <div className="ui-date-field ui-time-picker"><span>{label}</span><div className="ui-date-picker__control"><button type="button" className="ui-date-picker__trigger" disabled={disabled} onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open}><span>{value || 'Chọn giờ'}</span><span aria-hidden="true">◷</span></button>{open && <div className="ui-time-popup" role="listbox">{times.map(time => <button type="button" role="option" aria-selected={value === time} className={value === time ? 'is-active' : ''} key={time} onClick={() => { onChange?.(time); setOpen(false); }}>{time}</button>)}</div>}</div></div>;
}

function localParts(value) {
  const date = toDateValue(value);
  if (!date || Number.isNaN(date.getTime())) return { date: null, hour: '08', minute: '00' };
  return { date, hour: String(date.getHours()).padStart(2, '0'), minute: String(date.getMinutes()).padStart(2, '0') };
}

function formatDateTime(value) {
  const date = toDateValue(value);
  if (!date || Number.isNaN(date.getTime())) return '';
  return `${new Intl.DateTimeFormat('vi-VN').format(date)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function DateTimePicker({ value, onChange, label, minDate, maxDate, disabled = false }) {
  const rootRef = useRef(null);
  const initial = localParts(value);
  const [open, setOpen] = useState(false);
  const [draftDate, setDraftDate] = useState(initial.date);
  const [viewMonth, setViewMonth] = useState(initial.date || new Date());
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);

  useEffect(() => {
    if (open) return;
    const next = localParts(value);
    setDraftDate(next.date);
    setViewMonth(next.date || new Date());
    setHour(next.hour);
    setMinute(next.minute);
  }, [value, open]);

  useEffect(() => {
    if (!open) return undefined;
    const close = event => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const start = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const gridStart = new Date(start);
  gridStart.setDate(1 - ((start.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, index) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index));
  const isDisabled = date => {
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const min = minDate ? new Date(minDate) : null;
    const max = maxDate ? new Date(maxDate) : null;
    return (min && day < new Date(min.getFullYear(), min.getMonth(), min.getDate())) || (max && day > new Date(max.getFullYear(), max.getMonth(), max.getDate()));
  };
  const chooseShortcut = amount => {
    const next = new Date();
    if (amount === 'weekend') next.setDate(next.getDate() + ((6 - next.getDay() + 7) % 7));
    else next.setDate(next.getDate() + amount);
    setDraftDate(next); setViewMonth(next);
  };
  const reset = () => { const next = localParts(value); setDraftDate(next.date); setViewMonth(next.date || new Date()); setHour(next.hour); setMinute(next.minute); };
  const confirm = () => {
    if (!draftDate) return;
    const result = new Date(draftDate.getFullYear(), draftDate.getMonth(), draftDate.getDate(), Number(hour), Number(minute), 0, 0);
    onChange?.(result.toISOString()); setOpen(false);
  };
  const selectedLabel = `${hour}:${minute} (GMT+7)`;

  return <div className="ui-date-field ui-date-time-picker" ref={rootRef}>
    {label && <span>{label}</span>}
    <div className="ui-date-time-picker__control">
      <button type="button" className={`ui-date-time-picker__trigger${open ? ' is-open' : ''}`} disabled={disabled} onClick={() => setOpen(current => !current)} aria-haspopup="dialog" aria-expanded={open}>
        <CalendarDays/><span>{formatDateTime(value) || 'Chọn ngày và giờ'}</span><Clock3/>
      </button>
      {open && <div className="ui-date-time-popup" role="dialog" aria-label={label || 'Chọn ngày và giờ'}>
        <div className="ui-date-time-popup__main">
          <section className="ui-datetime-calendar">
            <header><strong>{new Intl.DateTimeFormat('vi-VN', { month: '2-digit', year: 'numeric' }).format(viewMonth).replace('tháng ', 'Tháng ')}</strong><div><button type="button" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))} aria-label="Tháng trước"><ChevronLeft/></button><button type="button" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))} aria-label="Tháng sau"><ChevronRight/></button></div></header>
            <div className="ui-datetime-calendar__week">{['T2','T3','T4','T5','T6','T7','CN'].map(item => <span key={item}>{item}</span>)}</div>
            <div className="ui-datetime-calendar__days">{days.map(date => { const active = draftDate && date.toDateString() === draftDate.toDateString(); const outside = date.getMonth() !== viewMonth.getMonth(); return <button type="button" key={date.toISOString()} disabled={isDisabled(date)} className={`${active ? 'is-active ' : ''}${outside ? 'is-outside' : ''}`} onClick={() => setDraftDate(date)}>{date.getDate()}</button>; })}</div>
          </section>
          <section className="ui-datetime-time">
            <header><strong><Clock3/>Chọn giờ thi</strong><span><b>24H</b><i>12H</i></span></header>
            <div className="ui-datetime-time__columns"><TimeColumn label="Giờ" values={Array.from({length:24},(_,i)=>String(i).padStart(2,'0'))} value={hour} onChange={setHour}/><TimeColumn label="Phút" values={['00','15','30','45']} value={minute} onChange={setMinute}/></div>
            <div className="ui-datetime-time__selected"><span>Đã chọn:</span><strong>{selectedLabel}</strong></div>
          </section>
        </div>
        <footer className="ui-date-time-popup__footer"><div><span>Gợi ý:</span><button type="button" onClick={() => chooseShortcut(0)}>Hôm nay</button><button type="button" onClick={() => chooseShortcut(1)}>Ngày mai</button><button type="button" onClick={() => chooseShortcut('weekend')}>Cuối tuần này</button></div><aside><button type="button" onClick={reset}>Đặt lại</button><button type="button" className="confirm" disabled={!draftDate} onClick={confirm}><Check/>Xác nhận</button></aside></footer>
      </div>}
    </div>
  </div>;
}

function TimeColumn({ label, values, value, onChange }) {
  return <div><span>{label}</span><div>{values.map(item => <button type="button" key={item} className={item === value ? 'is-active' : ''} onClick={() => onChange(item)}>{item}</button>)}</div></div>;
}

export function DateDisplay({ value, includeTime = false }) { return <time dateTime={value}>{formatDate(value, includeTime)}</time>; }
