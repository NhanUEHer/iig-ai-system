import React from 'react';
import { Search } from 'lucide-react';
import './sidebar.css';

export function CommandSearch({ placeholder = 'Search or jump to…', shortcut = '⌘ K', onClick }) {
  return <button type="button" className="iig3-command-search" aria-label={placeholder} onClick={onClick}><Search aria-hidden="true" /><span>{placeholder}</span>{shortcut && <kbd>{shortcut}</kbd>}</button>;
}
