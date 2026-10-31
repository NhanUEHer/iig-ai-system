import React, { useState } from 'react';
import {
  Activity, Bell, Bot, CalendarDays, Filter, Gauge, KeyRound, LayoutDashboard,
  Plus, RefreshCw, RotateCcw, ShieldCheck, Trash2, Users, Webhook,
} from 'lucide-react';
import { Alert, Button, CodeInput, IconButton, SegmentedControl, Stack, Surface, ThemeScope } from '../components';
import {
  AppShell, Avatar, AvatarGroup, Badge, Breadcrumb, ColumnButton, CommandSearch,
  DataTable, DataView, DetailsList, FilterBar, FilterChip, PageHeader, Pagination,
  ProgressBar, ReorderableDataTable, StatCard, StatusBadge, TableToolbar, Tabs, UserCell,
} from '../components';
import './batch2-showcase.css';

const jobs = [
  { id: 'job_01JDB82', keycode: 'KWW3VO', tenant: 'IIG Vietnam', scope: 'Speaking', completed: 12, total: 12, status: 'completed', created: '25 Oct · 09:42' },
  { id: 'job_01JDB76', keycode: 'D9YG1P', tenant: 'IIG Vietnam', scope: 'Writing', completed: 7, total: 8, status: 'processing', created: '25 Oct · 09:36' },
  { id: 'job_01JDB41', keycode: 'JA6HCS', tenant: 'IIG Beta', scope: 'Speaking', completed: 2, total: 12, status: 'failed', created: '25 Oct · 09:22' },
  { id: 'job_01JDA98', keycode: 'PC4R8S', tenant: 'Partner Sandbox', scope: 'S + W', completed: 0, total: 20, status: 'queued', created: '25 Oct · 09:10' },
];

const navigation = [
  { label: 'Workspace', items: [{ label: 'Overview', icon: LayoutDashboard }, { label: 'Scoring jobs', icon: Bot, active: true, count: 24 }, { label: 'Tenants', icon: Users }] },
  { label: 'Integration', items: [{ label: 'Credentials', icon: KeyRound }, { label: 'Webhooks', icon: Webhook }] },
  { label: 'Operations', items: [{ label: 'Monitoring', icon: Activity }, { label: 'Permissions', icon: ShieldCheck }] },
];

export default function Batch2Showcase() {
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('all');
  const [tab, setTab] = useState('table');
  const [density, setDensity] = useState('comfortable');
  const [tableState, setTableState] = useState('data');
  const [orderedJobs, setOrderedJobs] = useState(jobs.slice(0, 3));
  const filtered = jobs.filter(job => (view !== 'failed' || job.status === 'failed') && `${job.keycode} ${job.id} ${job.tenant}`.toLowerCase().includes(search.toLowerCase()));
  const columns = [
    { key: 'keycode', label: 'Scoring job', sortable: true, render: row => <span className="iig3-b2-job"><strong>{row.keycode}</strong><code>{row.id}</code></span> },
    { key: 'tenant', label: 'Tenant', sortable: true, render: row => <UserCell name={row.tenant} description="Scoring API" status={row.status === 'processing' ? 'online' : undefined} /> },
    { key: 'scope', label: 'Scope' },
    { key: 'progress', label: 'Progress', render: row => <ProgressBar value={row.completed} max={row.total} tone={row.status === 'completed' ? 'success' : 'ai'} label={<StatusBadge status={row.status} />} /> },
    { key: 'created', label: 'Created', sortable: true },
  ];
  const rowData = filtered.map(row => ({ ...row, actions: [{ label: 'Open detail' }, { label: 'Retry job', icon: <RotateCcw /> }, { separator: true }, { label: 'Cancel job', icon: <Trash2 />, danger: true }] }));

  return <ThemeScope className="iig3-b2-page">
    <header className="iig3-b2-page__header"><div><small>Design system</small><strong>Batch 2 · Navigation & data</strong></div><nav><a href="#shell">App shell</a><a href="#data">Data table</a><a href="#display">Data display</a><Button size="sm" icon={<Plus />}>Add component</Button></nav></header>
    <main>
      <section className="iig3-b2-hero"><span>BATCH 02 · READY FOR REVIEW</span><h1>Structure the work.<br />Reveal the signal.</h1><p>Navigation and data components for operational dashboards, tenant management and high-density scoring workflows.</p><div><Badge tone="accent">22 components</Badge><Badge>3 pattern families</Badge><AvatarGroup people={[{ name: 'AI System' }, { name: 'Operations' }, { name: 'Tenant Admin' }, { name: 'Support' }]} max={3} /></div></section>

      <section id="shell" className="iig3-b2-section"><SectionHeader number="01" title="Application shell" description="A reusable workspace frame with collapsible navigation, command search and tenant context." />
        <AppShell brand="IIG Operations" workspace={{ name: 'IIG Vietnam', description: 'Production workspace' }} navigation={navigation} topbar={<><CommandSearch /><Stack direction="horizontal" gap="sm"><StatusBadge status="healthy" label="All systems operational" /><IconButton size="sm" label="Notifications"><Bell /></IconButton><Avatar name="Nhan Nguyen" size="sm" status="online" /></Stack></>}>
          <Breadcrumb items={['IIG Admin', 'AI Scoring', 'Scoring jobs']} />
          <div className="iig3-b2-shell-content"><PageHeader eyebrow="AI Scoring service" title="Scoring jobs" description="Monitor planned runs, scoring progress and terminal delivery across every tenant." metadata={<><Badge tone="info" dot>Live updates</Badge><span className="iig3-b2-meta">Last refreshed 12s ago</span></>} actions={<><Button variant="outline" icon={<RefreshCw />}>Refresh</Button><Button icon={<Plus />}>Create job</Button></>} />
            <div className="iig3-b2-stats"><StatCard label="Jobs today" value="1,248" delta="+12.4%" helper="vs. yesterday" icon={<Bot />} /><StatCard label="In progress" value="37" delta="8 workers" helper="healthy capacity" icon={<Activity />} /><StatCard label="Success rate" value="99.2%" delta="+0.6%" helper="last 24 hours" icon={<Gauge />} /><StatCard label="Needs attention" value="6" tone="danger" delta="3 failed" helper="2 tenants" icon={<ShieldCheck />} /></div>
          </div>
        </AppShell>
      </section>

      <section id="data" className="iig3-b2-section"><SectionHeader number="02" title="Operational data table" description="Sort, filter, select, scan progress and act without turning every row into a card." />
        <DataView toolbar={<><TableToolbar title="All scoring jobs" count={24} selection={selected.length} view={<SegmentedControl value={view} onChange={setView} options={[{ value: 'all', label: 'All', count: 24 }, { value: 'failed', label: 'Failed', count: 3 }]} />} actions={<ColumnButton />} bulkActions={<><Button size="sm" variant="outline" icon={<RotateCcw />}>Retry</Button><Button size="sm" variant="danger" icon={<Trash2 />}>Cancel jobs</Button></>} /><FilterBar search={search} onSearch={event => setSearch(event.target.value)} placeholder="Job ID, scoring ID or keycode" filters={<><Button variant="outline" icon={<Filter />}>Status</Button><Button variant="outline" icon={<CalendarDays />}>Created</Button></>} chips={[<FilterChip key="tenant" label="Tenant" value="IIG Vietnam" />, <FilterChip key="scope" label="Scope" value="All" />]} actions={<Button icon={<Plus />}>Create job</Button>} /></>} pagination={<Pagination page={1} pageCount={tableState === 'data' ? 3 : 1} pageSize={10} total={tableState === 'data' ? 24 : 0} />}><DataTable columns={columns} rows={tableState === 'data' ? rowData : []} selected={selected} onSelected={setSelected} density={density} loading={tableState === 'loading'} empty={tableState === 'error' ? <Alert tone="danger" title="Jobs could not load">The request timed out. Existing data was not changed.</Alert> : 'No scoring jobs match the current filters.'} /></DataView>
        <div className="iig3-b2-preview-controls"><div><span>Table state</span><SegmentedControl value={tableState} onChange={setTableState} options={[{ value: 'data', label: 'Data' }, { value: 'loading', label: 'Loading' }, { value: 'empty', label: 'Empty' }, { value: 'error', label: 'Error' }]} /></div><div><span>Density</span><SegmentedControl value={density} onChange={setDensity} options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} /></div></div>
        <Surface padding="none" className="iig3-b2-reorder-preview"><header><div><h3>Ordered operational data</h3><p>Drag the handle or focus it and use Arrow, Home and End keys.</p></div><Badge tone="info">Keyboard accessible</Badge></header><ReorderableDataTable columns={columns.slice(0, 3)} rows={orderedJobs} reorderLabel="Sắp xếp công việc" isRowReorderable={row => row.status !== 'failed'} onReorder={({ orderedRows }) => setOrderedJobs(orderedRows)} /></Surface>
      </section>

      <section id="display" className="iig3-b2-section"><SectionHeader number="03" title="Display & navigation primitives" description="Identity, status, hierarchy and metadata use one predictable visual grammar." />
        <Tabs value={tab} onChange={setTab} items={[{ value: 'table', label: 'Overview' }, { value: 'runs', label: 'Planned runs', count: 12 }, { value: 'events', label: 'Timeline', count: 18 }, { value: 'payload', label: 'Payload' }]} />
        {tab === 'table' && <div className="iig3-b2-grid"><Surface padding="lg"><h3>Status and identity</h3><p>Small, semantic signals designed for dense operational views.</p><Stack direction="horizontal" gap="sm"><StatusBadge status="completed" /><StatusBadge status="processing" /><StatusBadge status="queued" /><StatusBadge status="failed" /><StatusBadge status="warning" /><StatusBadge status="disabled" /></Stack><Stack direction="horizontal" gap="md"><Avatar name="AI" size="sm" /><Avatar name="Nhan Nguyen" status="online" /><Avatar name="Service owner" size="lg" status="offline" /><AvatarGroup people={[{ name: 'IIG' }, { name: 'Beta' }, { name: 'Partner' }, { name: 'Admin' }]} /></Stack><UserCell name="A very long partner tenant name that truncates safely" description="External scoring integration" status="online" /></Surface>
          <Surface padding="lg"><h3>Immutable metadata</h3><p>Labels stay quiet while operational values remain easy to scan and copy.</p><DetailsList items={[{ label: 'Job ID', value: 'job_01JDB82', mono: true, copyable: true }, { label: 'Tenant', value: 'IIG Vietnam' }, { label: 'Scope', value: 'Speaking' }, { label: 'Created at', value: '25 Oct 2026 · 09:42' }, { label: 'Request ID', value: 'req_8f1a2c', mono: true, copyable: true }, { label: 'Webhook delivery', value: null }, { label: 'Owner', value: <UserCell name="Scoring API" description="Service account" /> }]} /></Surface></div>}
        {tab === 'runs' && <Surface padding="lg" className="iig3-b2-tab-panel"><TabPanelHeader title="Planned runs" description="Execution plan derived from sections and scoring groups in the submitted payload." action={<Badge tone="info">9 of 12 completed</Badge>} /><div className="iig3-b2-run-list"><RunRow name="RTA Q1–Q2" description="Grouped scoring · 2 questions" status="completed" value={2} total={2} /><RunRow name="Respond Q5–Q10" description="Grouped scoring · 6 questions" status="completed" value={6} total={6} /><RunRow name="Describe picture" description="Question scoring · 2 questions" status="processing" value={1} total={2} /><RunRow name="Express opinion" description="Question scoring · 1 question" status="queued" value={0} total={1} /></div></Surface>}
        {tab === 'events' && <Surface padding="lg" className="iig3-b2-tab-panel"><TabPanelHeader title="Timeline" description="Immutable operational events ordered from newest to oldest." action={<Badge>18 events</Badge>} /><div className="iig3-b2-timeline"><TimelineItem time="10:05:04" title="Webhook delivered" description="HTTP 200 · attempt 2 · 428ms" status="completed" /><TimelineItem time="10:04:31" title="Scoring group completed" description="Respond Q5–Q10 · 6/6 questions" status="completed" /><TimelineItem time="10:03:18" title="Model execution started" description="Describe picture · question 4" status="processing" /><TimelineItem time="10:02:07" title="Job accepted" description="Payload validated and execution plan created" status="queued" /></div></Surface>}
        {tab === 'payload' && <Surface padding="lg" className="iig3-b2-tab-panel"><TabPanelHeader title="Immutable payload" description="Validated request snapshot used to create this scoring attempt." action={<Badge tone="success">Schema valid</Badge>} /><CodeInput language="JSON" value={'{\n  "scoring_id": "9063e533-779f-4313-b891-5b8ed353a5ed",\n  "keycode": "KWW3VO",\n  "scope": ["speaking"],\n  "tenant": "iig-vietnam",\n  "attempt": 1\n}'} rows={9} readOnly /></Surface>}
      </section>
    </main>
  </ThemeScope>;
}

function SectionHeader({ number, title, description }) { return <header className="iig3-b2-section__header"><span>{number}</span><div><h2>{title}</h2><p>{description}</p></div></header>; }

function TabPanelHeader({ title, description, action }) { return <header className="iig3-b2-tab-panel__header"><div><h3>{title}</h3><p>{description}</p></div>{action}</header>; }
function RunRow({ name, description, status, value, total }) { return <article><div><strong>{name}</strong><small>{description}</small></div><ProgressBar value={value} max={total} tone={status === 'completed' ? 'success' : 'ai'} label={<StatusBadge status={status} />} /></article>; }
function TimelineItem({ time, title, description, status }) { return <article><time>{time}</time><i className={`is-${status}`} /><div><strong>{title}</strong><small>{description}</small></div><StatusBadge status={status} /></article>; }
