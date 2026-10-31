import React, { useEffect, useState } from 'react';
import { Bell, LogOut, Menu as MenuIcon, UserRound } from 'lucide-react';
import { IconButton, Menu } from '../primitives/Primitives';
import { Avatar, StatusBadge } from './Navigation';
import { CommandPalette } from '../workflow/Workflow';
import { CommandSearch } from './CommandSearch';
import './application-header.css';

export function ApplicationHeader({
  commands = [],
  searchPlaceholder = 'Tìm kiếm hoặc chuyển nhanh…',
  searchShortcut = '⌘ K',
  systemStatus = 'healthy',
  systemStatusLabel = 'Hoạt động',
  notificationCount = 0,
  onNotifications,
  user,
  onUserClick,
  onLogout,
  onCommandSelect,
  onMenuClick,
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKeyDown = event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
      }
      if (event.key === 'Escape') setPaletteOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const selectCommand = command => {
    onCommandSelect?.(command);
    setPaletteOpen(false);
    setQuery('');
  };

  return <>
    <header className="iig3-application-header">
      {onMenuClick && <IconButton className="iig3-application-header__menu" size="sm" variant="ghost" label="Mở menu" onClick={onMenuClick}><MenuIcon /></IconButton>}
      <CommandSearch placeholder={searchPlaceholder} shortcut={searchShortcut} onClick={() => setPaletteOpen(true)} />
      <div className="iig3-application-header__actions">
        <StatusBadge status={systemStatus} label={systemStatusLabel} />
        <span className="iig3-application-header__notification">
          <IconButton size="sm" label="Thông báo" onClick={onNotifications}><Bell /></IconButton>
          {notificationCount > 0 && <em>{notificationCount > 99 ? '99+' : notificationCount}</em>}
        </span>
        <Menu align="end" trigger={<button type="button" className="iig3-application-header__user" aria-label="Mở menu tài khoản">
          <Avatar name={user?.name || 'Người dùng'} src={user?.avatar} size="sm" status={user?.status || 'online'} />
          <strong>{user?.name || 'Người dùng'}</strong>
        </button>} items={[
          { label: 'Hồ sơ', icon: <UserRound />, onClick: onUserClick },
          { label: 'Đăng xuất', icon: <LogOut />, danger: true, onClick: onLogout },
        ]} />
      </div>
    </header>
    <CommandPalette open={paletteOpen} commands={commands} query={query} onQuery={setQuery} onClose={() => setPaletteOpen(false)} onSelect={selectCommand} />
  </>;
}
