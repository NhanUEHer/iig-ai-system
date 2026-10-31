import React, { useEffect, useState } from 'react';
import Batch1Showcase from './batch1/Batch1Showcase';
import Batch2Showcase from './batch2/Batch2Showcase';
import Batch3Showcase from './batch3/Batch3Showcase';
import Batch4Showcase from './batch4/Batch4Showcase';
import Batch5Showcase from './batch5/Batch5Showcase';
import Batch6Showcase from './batch6/Batch6Showcase';
import * as componentLibrary from './components/index';
import './tokens.css';
import './gallery.css';
import './typography.css';

const batches = [
  { id: 1, label: 'Foundation & controls', component: Batch1Showcase },
  { id: 2, label: 'Navigation & data', component: Batch2Showcase },
  { id: 3, label: 'Workflow & visualization', component: Batch3Showcase },
  { id: 4, label: 'AI Scoring business', component: Batch4Showcase },
  { id: 5, label: 'Page templates', component: Batch5Showcase },
  { id: 6, label: 'Phase 1 prototype', component: Batch6Showcase },
];

const readBatch = () => {
  const value = Number(new URLSearchParams(window.location.search).get('batch'));
  return batches.some(batch => batch.id === value) ? value : 1;
};

export default function DesignSystemGallery() {
  // Keep the complete public API in the development build so every component is compiled.
  void componentLibrary;
  const [active, setActive] = useState(readBatch);
  const [menuOpen, setMenuOpen] = useState(false);
  const current = batches.find(batch => batch.id === active) || batches[0];
  const Showcase = current.component;

  useEffect(() => {
    const onPopState = () => setActive(readBatch());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const select = id => {
    const url = new URL(window.location.href);
    url.searchParams.set('batch', id);
    window.history.pushState({}, '', url);
    window.scrollTo({ top: 0, behavior: 'instant' });
    setActive(id);
    setMenuOpen(false);
  };

  return <div className="iig3-gallery"><nav className={menuOpen ? 'is-open' : ''} aria-label="Design system batches"><button type="button" className="iig3-gallery__toggle" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}><span>{menuOpen ? 'Close' : `B${active}`}</span><small>{menuOpen ? 'Hide batch menu' : current.label}</small></button><div className="iig3-gallery__menu"><strong>UI review</strong>{batches.map(batch => <button type="button" key={batch.id} className={active === batch.id ? 'is-active' : ''} onClick={() => select(batch.id)}><span>Batch {batch.id}</span><small>{batch.label}</small></button>)}</div></nav><div className="iig3-gallery__stage"><Showcase /></div></div>;
}
