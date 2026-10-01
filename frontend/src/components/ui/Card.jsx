import React from 'react';
import './ui.css';

export function Card({ title, description, actions, children, className = '' }) {
  return <section className={['ui-card', className].filter(Boolean).join(' ')}>
    {(title || description || actions) && <header className="ui-card__header"><div>{title && <h2 className="ui-card__title">{title}</h2>}{description && <p className="ui-card__description">{description}</p>}</div>{actions}</header>}
    <div className="ui-card__body">{children}</div>
  </section>;
}
