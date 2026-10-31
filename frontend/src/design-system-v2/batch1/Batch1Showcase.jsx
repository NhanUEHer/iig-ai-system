import React, { useState } from 'react';
import {
  Archive, ArrowRight, Bell, Bot, Copy, Database, KeyRound,
  MoreHorizontal, Plus, RefreshCw, Settings2, ShieldCheck, Sparkles, Trash2,
  UploadCloud, Webhook,
} from 'lucide-react';
import {
  Alert, Banner, Button, ButtonGroup, Checkbox, CodeInput, ComponentIndex,
  ConfirmDialog, Divider, Drawer, EmptyState, ErrorState, FileDropzone,
  FormField, Grid, Heading, IconButton, Input, Menu, Modal, NumberInput,
  Popover, RadioGroup, SearchInput, SecretInput, SegmentedControl, Select,
  Skeleton, Spinner, SplitButton, Stack, Surface, Switch, TagInput, Textarea,
  ThemeScope, Toast, Tooltip,
} from '../components';
import './batch1-showcase.css';

const componentInventory = [
  ...['ThemeScope', 'Surface', 'Stack', 'Grid', 'Heading', 'Divider'].map(name => ({ group: 'Foundation', name })),
  ...['Button', 'IconButton', 'ButtonGroup', 'SplitButton', 'Menu'].map(name => ({ group: 'Actions', name })),
  ...['FormField', 'Input', 'SearchInput', 'Textarea', 'Select', 'Checkbox', 'RadioGroup', 'Switch', 'SegmentedControl', 'NumberInput', 'TagInput', 'SecretInput', 'FileDropzone', 'CodeInput'].map(name => ({ group: 'Form controls', name })),
  ...['Alert', 'Banner', 'Toast', 'Modal', 'ConfirmDialog', 'Drawer', 'Tooltip', 'Popover', 'EmptyState', 'ErrorState', 'Spinner', 'Skeleton'].map(name => ({ group: 'Feedback', name })),
];

const navItems = [
  ['overview', 'Overview'], ['foundation', 'Foundation'], ['actions', 'Actions'],
  ['forms', 'Form controls'], ['feedback', 'Feedback'],
];

export default function Batch1Showcase() {
  const [section, setSection] = useState('overview');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('automatic');
  const [attempts, setAttempts] = useState(3);
  const [tags, setTags] = useState(['speaking', 'production']);
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [toast, setToast] = useState(false);
  const [banner, setBanner] = useState(true);

  const show = name => section === 'overview' || section === name;

  return (
    <ThemeScope className="iig3-showcase">
      <aside className="iig3-showcase__rail">
        <div className="iig3-showcase__brand"><span><Sparkles /></span><div><strong>IIG System</strong><small>Design language</small></div></div>
        <nav>{navItems.map(([value, label]) => <button key={value} className={section === value ? 'is-active' : ''} onClick={() => setSection(value)}><span>{label}</span>{value === 'overview' && <em>{componentInventory.length}</em>}</button>)}</nav>
        <div className="iig3-showcase__rail-note"><Bot /><strong>Operational intelligence</strong><small>Warm, calm and precise for human + AI workflows.</small></div>
      </aside>

      <main className="iig3-showcase__main">
        <header className="iig3-showcase__topbar">
          <div><small>Design system / Batch 1</small><strong>Foundations & controls</strong></div>
          <Stack direction="horizontal" gap="sm"><Tooltip content="Component notifications"><IconButton label="Notifications"><Bell /></IconButton></Tooltip><Button icon={<Plus />}>New component</Button></Stack>
        </header>

        <div className="iig3-showcase__content">
          <section className="iig3-showcase__hero">
            <div><span className="iig3-showcase__eyebrow">Batch 01 · Ready for review</span><h1>A calm interface for complex AI operations.</h1><p>A standalone, reusable component foundation for IIG Admin—built without legacy UI dependencies.</p></div>
            <Surface className="iig3-showcase__summary" padding="lg"><small>Coverage</small><strong>{componentInventory.length}</strong><span>components across 4 families</span><div><i /><i /><i /><i /></div></Surface>
          </section>

          {show('foundation') && <DemoSection number="01" title="Foundation" description="Layout primitives, surfaces and hierarchy shared by every operational screen.">
            <Grid columns={3}>
              <Surface><Heading eyebrow="Section label" level={2} description="Compact editorial hierarchy for dense admin screens.">Heading system</Heading></Surface>
              <Surface tone="muted"><Heading level={3} description="Subtle contrast without visual noise.">Muted surface</Heading></Surface>
              <Surface><Stack gap="sm"><strong>Semantic color</strong><div className="iig3-showcase__swatches"><i className="is-accent" /><i className="is-ai" /><i className="is-success" /><i className="is-warning" /><i className="is-danger" /></div></Stack></Surface>
            </Grid>
            <Divider label="Editorial divider" />
          </DemoSection>}

          {show('actions') && <DemoSection number="02" title="Actions" description="Clear priority, compact density and predictable destructive states.">
            <Surface><Stack direction="horizontal" gap="sm"><Button icon={<Plus />}>Create tenant</Button><Button variant="secondary" icon={<Bot />}>Run scoring</Button><Button variant="outline" icon={<RefreshCw />}>Refresh</Button><Button variant="ghost">Cancel</Button><Button variant="danger" icon={<Trash2 />}>Delete</Button><Button loading>Saving</Button><Button disabled>Disabled</Button></Stack></Surface>
            <Grid columns={2}>
              <Surface><Heading level={3} description="Grouped actions keep context and hierarchy intact.">Compound actions</Heading><Stack direction="horizontal" gap="md" className="iig3-showcase__demo-row"><SplitButton icon={<UploadCloud />} items={[{ label: 'Upload JSON', description: 'Import a structured payload' }, { label: 'Paste payload', description: 'Open the code editor' }]}>Import data</SplitButton><ButtonGroup><Button variant="outline">Approve</Button><Button variant="outline">Request changes</Button></ButtonGroup></Stack></Surface>
              <Surface><Heading level={3} description="Menus and contextual actions remain quiet until requested.">Context actions</Heading><Stack direction="horizontal" gap="md" className="iig3-showcase__demo-row"><Menu trigger={<IconButton label="More actions"><MoreHorizontal /></IconButton>} items={[{ icon: <Copy />, label: 'Duplicate', shortcut: '⌘D' }, { icon: <Archive />, label: 'Archive' }, { separator: true }, { icon: <Trash2 />, label: 'Delete', danger: true }]} /><Tooltip content="Security settings"><IconButton label="Security settings"><ShieldCheck /></IconButton></Tooltip><Popover trigger={<Button variant="outline" icon={<Settings2 />}>Quick settings</Button>}><Stack gap="sm"><strong>Execution policy</strong><Switch defaultChecked label="Require validation" /></Stack></Popover></Stack></Surface>
            </Grid>
          </DemoSection>}

          {show('forms') && <DemoSection number="03" title="Form controls" description="Composable fields for tenant onboarding, credentials, webhooks and job operations.">
            <Grid columns={2}>
              <Surface padding="lg"><Heading eyebrow="Tenant setup" level={2} description="Field-level guidance and validation remain close to the input.">Integration details</Heading><Stack gap="md" className="iig3-showcase__form"><FormField label="Tenant name" required description="Visible to internal operators"><Input defaultValue="IIG Vietnam" /></FormField><FormField label="Webhook URL" required error="Use an HTTPS endpoint"><Input invalid defaultValue="http://partner.example/webhook" prefix={<Webhook />} /></FormField><FormField label="Environment"><Select defaultValue="production"><option value="sandbox">Sandbox</option><option value="beta">Beta</option><option value="production">Production</option></Select></FormField><FormField label="Description"><Textarea placeholder="Integration purpose and owner" /></FormField></Stack></Surface>
              <Surface padding="lg"><Heading eyebrow="Execution policy" level={2} description="Control behavior without hiding important consequences.">Scoring options</Heading><Stack gap="lg" className="iig3-showcase__form"><FormField label="Search jobs"><SearchInput value={query} onChange={event => setQuery(event.target.value)} placeholder="Job ID, scoring ID or keycode" /></FormField><RadioGroup label="Dispatch mode" value={mode} onChange={setMode} options={[{ value: 'automatic', label: 'Automatic', description: 'Run when validated' }, { value: 'manual', label: 'Manual', description: 'Wait for approval' }]} /><Checkbox defaultChecked label="Send terminal events" description="Deliver completed and failed results" /><Switch defaultChecked label="Tenant enabled" description="Allow new scoring jobs" /><FormField label="Maximum attempts"><NumberInput compact value={attempts} onChange={setAttempts} min={1} max={10} /></FormField></Stack></Surface>
            </Grid>
            <Grid columns={2}>
              <Surface><Heading level={3} description="Small structured values, secrets and permissions.">Specialized inputs</Heading><Stack gap="md" className="iig3-showcase__demo-column"><SegmentedControl value="speaking" options={[{ value: 'speaking', label: 'Speaking' }, { value: 'writing', label: 'Writing' }, { value: 'both', label: 'S + W' }]} /><TagInput value={tags} onChange={setTags} /><SecretInput value="iig_beta_7fd9a21bce2f" onCopy={() => setToast(true)} /></Stack></Surface>
              <Surface><Heading level={3} description="Payload and file capture for service integrations.">Structured input</Heading><Stack gap="md" className="iig3-showcase__demo-column"><FileDropzone description="JSON, CSV or ZIP · up to 20 MB" /><CodeInput value={'{\n  "scoring_id": "9063e533...",\n  "scope": ["speaking"]\n}'} readOnly /></Stack></Surface>
            </Grid>
            <Surface padding="lg" className="iig3-showcase__state-matrix">
              <Heading level={3} description="Every field uses the same visual contract across forms and operational workflows.">Control states</Heading>
              <div className="iig3-showcase__state-grid">
                <FormField label="Default"><Input placeholder="Enter a value" /></FormField>
                <FormField label="Filled"><Input value="IIG Vietnam" readOnly /></FormField>
                <FormField label="Focus"><Input className="is-focus-demo" value="Focused field" readOnly /></FormField>
                <FormField label="Error" error="This value is required"><Input invalid value="Invalid value" readOnly /></FormField>
                <FormField label="Disabled"><Input value="Unavailable" disabled /></FormField>
                <FormField label="Read-only"><Input value="tenant_iig_vietnam" readOnly /></FormField>
                <FormField label="Loading"><Input value="Validating…" readOnly suffix={<Spinner label="" />} /></FormField>
              </div>
            </Surface>
          </DemoSection>}

          {show('feedback') && <DemoSection number="04" title="Feedback & overlays" description="Consistent system feedback from inline validation to irreversible operations.">
            {banner && <Banner tone="info" title="Design-system preview" onClose={() => setBanner(false)}>These examples use sample data and do not call live scoring services.</Banner>}
            <Grid columns={2}><Alert tone="success" title="Webhook verified">The partner endpoint returned HTTP 200.</Alert><Alert tone="warning" title="Credential expires soon">Rotate this token within the next 7 days.</Alert><Alert tone="danger" title="Worker is unavailable" action={<Button size="sm" variant="outline">View incident</Button>}>New jobs remain safely queued.</Alert><Alert title="Reconciliation running">12 active jobs are being checked.</Alert></Grid>
            <Surface><Stack direction="horizontal" gap="sm"><Button onClick={() => setModal(true)}>Open modal</Button><Button variant="outline" onClick={() => setDrawer(true)}>Open drawer</Button><Button variant="outline" onClick={() => setConfirm(true)}>Confirm action</Button><Button variant="outline" onClick={() => setToast(true)}>Show toast</Button><Spinner label="Checking worker" /></Stack></Surface>
            <Grid columns={3}><Surface><EmptyState icon={<Database />} title="No jobs yet" description="Create the first scoring job or adjust your filters." action={<Button size="sm">Create job</Button>} /></Surface><Surface><ErrorState title="Jobs could not load" description="The request timed out. Existing data was not changed." action={<Button size="sm" variant="outline">Try again</Button>} /></Surface><Surface><Stack gap="md"><Heading level={3}>Loading state</Heading><Skeleton lines={5} /></Stack></Surface></Grid>
          </DemoSection>}

          {section === 'overview' && <DemoSection number="05" title="Complete inventory" description="Batch 1 contains the shared primitives required before building pages and business modules."><ComponentIndex components={componentInventory} /></DemoSection>}
        </div>
      </main>

      <Modal open={modal} title="Create API credential" description="The secret is shown once after creation." onClose={() => setModal(false)} footer={<><Button variant="ghost" onClick={() => setModal(false)}>Cancel</Button><Button iconAfter={<ArrowRight />}>Continue</Button></>}><Stack gap="md"><FormField label="Credential name" required><Input placeholder="Production scoring service" prefix={<KeyRound />} /></FormField><FormField label="Scopes"><TagInput value={['jobs:create', 'jobs:read']} /></FormField></Stack></Modal>
      <ConfirmDialog open={confirm} danger title="Revoke this credential?" description="Requests using this token will fail immediately. This action is audited." confirmLabel="Revoke credential" onClose={() => setConfirm(false)} onConfirm={() => { setConfirm(false); setToast(true); }} />
      <Drawer open={drawer} title="Webhook delivery" description="Inspect and replay a single immutable delivery." onClose={() => setDrawer(false)} footer={<><Button variant="outline" onClick={() => setDrawer(false)}>Close</Button><Button icon={<RefreshCw />}>Replay delivery</Button></>}><Stack gap="lg"><Alert tone="success" title="Delivered in 428 ms">HTTP 200 · attempt 1 of 5</Alert><FormField label="Destination"><Input value="https://partner.example/scoring/events" readOnly /></FormField><CodeInput value={'{\n  "event": "scoring.completed",\n  "job_id": "job_01J..."\n}'} readOnly /><Divider label="Audit" /><Checkbox defaultChecked disabled label="Signature verified" description="HMAC SHA-256" /></Stack></Drawer>
      {toast && <Toast title="Copied to clipboard" onClose={() => setToast(false)}>The sample credential is ready to paste.</Toast>}
    </ThemeScope>
  );
}

function DemoSection({ number, title, description, children }) {
  return <section className="iig3-showcase__section"><header><span>{number}</span><Heading level={2} description={description}>{title}</Heading></header><Stack gap="md">{children}</Stack></section>;
}
