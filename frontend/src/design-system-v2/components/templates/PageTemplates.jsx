import React from 'react';
import { ChevronLeft, PanelRightClose } from 'lucide-react';
import { Button, IconButton } from '../primitives/Primitives';
import { Breadcrumb, PageHeader, Tabs } from '../navigation/Navigation';
import './page-templates.css';

const cx = (...names) => names.filter(Boolean).join(' ');

export function PageFrame({ breadcrumb, breadcrumbLinkComponent, header, children, className = '' }) {
  return <div className={cx('iig3-page-frame', className)}>{breadcrumb && <Breadcrumb items={breadcrumb} LinkComponent={breadcrumbLinkComponent} />}{header}{children}</div>;
}

export function DashboardTemplate({ breadcrumb, title, description, actions, filters, metrics, chart, breakdown, activity }) {
  return <PageFrame className="iig3-template-dashboard" breadcrumb={breadcrumb} header={<PageHeader title={title} description={description} actions={actions} />}><div className="iig3-template-filters">{filters}</div><section className="iig3-template-metrics">{metrics}</section><section className="iig3-template-dashboard__primary">{chart}</section><div className="iig3-template-two-col"><section>{breakdown}</section><aside>{activity}</aside></div></PageFrame>;
}

export function ListPage({ breadcrumb, breadcrumbLinkComponent, eyebrow, title, description, metadata, actions, summary, toolbar, table, pagination, children, dataLabel = 'Danh sách dữ liệu', className = '' }) {
  return <PageFrame className={cx('iig3-template-list', className)} breadcrumb={breadcrumb} breadcrumbLinkComponent={breadcrumbLinkComponent} header={<PageHeader eyebrow={eyebrow} title={title} description={description} metadata={metadata} actions={actions} />}>{summary && <section className="iig3-template-summary">{summary}</section>}<section className="iig3-template-list__data" aria-label={dataLabel}>{toolbar}{table || children}{pagination}</section></PageFrame>;
}

export function ListTemplate(props) {
  return <ListPage {...props} />;
}

export function FormTemplate({ breadcrumb, title, description, status, sections = [], aside, footer }) {
  return <PageFrame className="iig3-template-form" breadcrumb={breadcrumb} header={<PageHeader title={title} description={description} metadata={status} />}><div className="iig3-template-form__layout"><main>{sections.map(section => <section key={section.title}><header><strong>{section.title}</strong>{section.description && <p>{section.description}</p>}</header><div>{section.content}</div></section>)}</main>{aside && <aside>{aside}</aside>}</div><footer className="iig3-template-sticky-footer">{footer}</footer></PageFrame>;
}

export function DetailTemplate({ breadcrumb, identity, actions, tabs, activeTab, onTab, children, aside }) {
  return <PageFrame className="iig3-template-detail" breadcrumb={breadcrumb}><header className="iig3-template-detail__head">{identity}{actions && <nav>{actions}</nav>}</header><Tabs items={tabs} value={activeTab} onChange={onTab} /><div className={cx('iig3-template-detail__body', aside && 'has-aside')}><main>{children}</main>{aside && <aside>{aside}</aside>}</div></PageFrame>;
}

export function SettingsTemplate({ breadcrumb, title, description, navigation = [], active, onNavigate, children, footer }) {
  return <PageFrame className="iig3-template-settings" breadcrumb={breadcrumb} header={<PageHeader title={title} description={description} />}><div className="iig3-template-settings__layout"><aside>{navigation.map(item => <button type="button" key={item.key} className={active === item.key ? 'is-active' : ''} onClick={() => onNavigate?.(item.key)}>{item.icon}<span><strong>{item.label}</strong>{item.description && <small>{item.description}</small>}</span></button>)}</aside><main>{children}</main></div>{footer && <footer className="iig3-template-sticky-footer">{footer}</footer>}</PageFrame>;
}

export function BuilderTemplate({ title, status, actions, structure, editor, inspector, footer }) {
  return <div className="iig3-template-builder"><header><div><IconButton size="sm" variant="ghost" label="Back"><ChevronLeft /></IconButton><span><small>Builder</small><strong>{title}</strong></span>{status}</div><nav>{actions}</nav></header><div><aside>{structure}</aside><main>{editor}</main><aside>{inspector}<IconButton className="iig3-template-builder__close" size="sm" variant="ghost" label="Close inspector"><PanelRightClose /></IconButton></aside></div>{footer && <footer>{footer}</footer>}</div>;
}

export function OperationsTemplate({ breadcrumb, title, description, health, incidents, queue, trace, actions }) {
  return <PageFrame className="iig3-template-operations" breadcrumb={breadcrumb} header={<PageHeader title={title} description={description} actions={actions} />}><section className="iig3-template-operations__health">{health}</section><div className="iig3-template-operations__grid"><main><section>{incidents}</section><section>{queue}</section></main><aside>{trace}</aside></div></PageFrame>;
}

export function TemplatePreview({ label, description, status, selected, onClick, children }) {
  return <button type="button" className={cx('iig3-template-preview', selected && 'is-selected')} onClick={onClick}><div><span><strong>{label}</strong>{status && <em>{status}</em>}</span><small>{description}</small></div><span>{children}</span></button>;
}

export function SaveBar({ state = 'idle', message, primaryLabel = 'Save changes', onSave, onCancel }) {
  return <><div><strong>{state === 'saved' ? 'All changes saved' : state === 'saving' ? 'Saving changes…' : 'Unsaved changes'}</strong>{message && <small>{message}</small>}</div><nav><Button variant="ghost" onClick={onCancel}>Cancel</Button><Button loading={state === 'saving'} onClick={onSave}>{primaryLabel}</Button></nav></>;
}
