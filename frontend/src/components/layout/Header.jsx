import React from 'react';
import { Search, Sliders } from 'lucide-react';

const Header = ({
  title = "AI Scoring Admin",
  subtitle = "Hệ thống quản lý & chấm bài thi tự động",
  searchTerm,
  setSearchTerm,
  showSearch = false
}) => {
  return (
    <header style={{
      height: '64px',
      padding: '0 24px',
      background: 'var(--surface-low)',
      borderBottom: '1px solid var(--bento-border)',
      display: 'flex',
      alignItems: 'center',
      justify: 'space-between',
      flexShrink: 0,
      zIndex: 40
    }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: 'var(--on-surface)', fontFamily: 'Lexend, sans-serif' }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--on-surface-var)' }}>
            {subtitle}
          </p>
        )}
      </div>

      {showSearch && (
        <div style={{ position: 'relative', width: '280px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--on-surface-var)' }} />
          <input
            type="text"
            value={searchTerm || ''}
            onChange={(e) => setSearchTerm && setSearchTerm(e.target.value)}
            placeholder="Tìm kiếm..."
            className="glass-input"
            style={{ width: '100%', paddingLeft: '36px', fontSize: '13px', borderRadius: '20px' }}
          />
        </div>
      )}
    </header>
  );
};

export default Header;
