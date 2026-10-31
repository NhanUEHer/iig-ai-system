import React from 'react';
import { ChevronsUpDown } from 'lucide-react';

export function WorkspaceSwitcher({ name, description, logo, collapsed = false, onClick, disabled = false }) {
  return <button type="button" className="iig3-workspace-switcher" aria-label={collapsed ? `Switch workspace, current: ${name}` : undefined} data-tooltip={collapsed ? name : undefined} disabled={disabled} onClick={onClick}><span className="iig3-workspace-switcher__logo">{logo || name?.[0]}</span><span className="iig3-workspace-switcher__copy"><strong>{name}</strong>{description && <small>{description}</small>}</span><ChevronsUpDown aria-hidden="true" /></button>;
}
