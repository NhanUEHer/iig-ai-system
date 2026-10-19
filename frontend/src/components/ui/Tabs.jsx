import React from 'react';
import './ui.css';

export default function Tabs({ items, value, onChange }) {
  return <div className="ui-tabs" role="tablist">{items.map(item => <button key={item.value} type="button" role="tab" aria-selected={value === item.value} className="ui-tabs__trigger" onClick={() => onChange(item.value)}>{item.label}</button>)}</div>;
}
