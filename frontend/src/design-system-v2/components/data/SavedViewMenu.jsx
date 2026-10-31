import React from 'react';
import { Check, Star, Trash2 } from 'lucide-react';
import { IconButton } from '../primitives/Primitives';
import '../components.css';

export function SavedViewMenu({ views = [], value, onChange, onDelete }) {
  return <div className="iig3-saved-views" role="listbox" aria-label="Saved views">{views.map(view => <div className="iig3-saved-view" role="option" aria-selected={view.id === value} key={view.id}><Star aria-hidden="true" /><button type="button" className="iig3-inline-edit__value" onClick={() => onChange?.(view.id)}><span><strong>{view.name}</strong><small>{view.description}</small></span></button>{view.id === value && <Check aria-label="Current view" />}{onDelete && <IconButton label={`Delete ${view.name}`} size="sm" onClick={() => onDelete(view.id)}><Trash2 /></IconButton>}</div>)}</div>;
}
