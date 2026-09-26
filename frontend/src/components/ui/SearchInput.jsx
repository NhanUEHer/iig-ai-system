import React from 'react';
import { Search, X } from 'lucide-react';
import './ui.css';

export default function SearchInput({ value, onChange, placeholder = 'Tìm kiếm...', onClear }) {
  return <label className="ui-search"><Search aria-hidden="true" /><input value={value} onChange={onChange} placeholder={placeholder} />{value && onClear && <button type="button" onClick={onClear} aria-label="Xóa tìm kiếm"><X /></button>}</label>;
}
