import React from 'react';
import { ApplicationHeader as DesignSystemHeader } from '../../design-system-v2';
import { applicationNavigation } from './ApplicationSidebar';

function canSee(item, permissions) {
  if (item.permission && !permissions.includes(item.permission)) return false;
  return !item.permissions || item.permissions.some(permission => permissions.includes(permission));
}

export default function ApplicationHeader({ currentUser, navigate, onOpenAccount, onLogout }) {
  const permissions = currentUser?.permissions || [];
  const commands = applicationNavigation.flatMap(group => group.items
    .filter(item => item.to && !item.disabled && canSee(item, permissions))
    .map(item => ({
      id: item.id,
      label: item.label,
      description: group.label,
      icon: item.icon ? React.createElement(item.icon) : null,
      to: item.to,
    })));
  return <DesignSystemHeader
    commands={commands}
    user={{ name: currentUser?.name || 'Người dùng', status: 'online' }}
    onUserClick={onOpenAccount}
    onLogout={onLogout}
    onCommandSelect={command => command.to && navigate(command.to)}
  />;
}
