const define = (category, names, purpose) => names.map(name => ({ name, category, purpose, status: 'ready', importFrom: '@/design-system-v2' }));

export const componentCategories = Object.freeze({
  foundation: 'Layout and semantic typography primitives',
  actions: 'Buttons, menus and action affordances',
  forms: 'Input, selection and structured editing controls',
  feedback: 'System status, loading and overlay feedback',
  navigation: 'Application and local navigation',
  data: 'Dense operational data display and interaction',
  workflow: 'Workflow, trace and structured-data visualization',
  business: 'AI Scoring domain components',
  templates: 'Composable page layout contracts',
});

export const componentRegistry = Object.freeze([
  ...define('foundation', ['ThemeScope', 'Surface', 'Stack', 'Grid', 'Divider', 'Display', 'Title', 'Text', 'Label', 'Caption', 'CodeText'], 'Build consistent hierarchy without local type or spacing values.'),
  ...define('actions', ['Button', 'IconButton', 'ButtonGroup', 'Menu', 'SplitButton', 'Popover', 'Tooltip'], 'Expose clear, keyboard-accessible actions.'),
  ...define('forms', ['FormField', 'Input', 'SearchInput', 'Textarea', 'Select', 'Combobox', 'MultiSelect', 'MultiSelectFilter', 'Checkbox', 'RadioGroup', 'Switch', 'SegmentedControl', 'NumberInput', 'TagInput', 'SecretInput', 'FileDropzone', 'UploadProgress', 'CodeInput', 'InlineEdit', 'KeyValueEditor'], 'Capture and validate user input with shared states.'),
  ...define('feedback', ['Alert', 'Banner', 'Toast', 'Modal', 'ConfirmDialog', 'Drawer', 'EmptyState', 'ErrorState', 'Spinner', 'Skeleton', 'NotificationList'], 'Communicate state changes and interruption levels consistently.'),
  ...define('navigation', ['Breadcrumb', 'Tabs', 'Accordion', 'WorkspaceSwitcher', 'Sidebar', 'SidebarNav', 'SidebarNavGroup', 'SidebarNavItem', 'AppShell', 'ApplicationHeader', 'CommandSearch', 'CommandPalette'], 'Move through product hierarchy and reveal content.'),
  ...define('data', ['Badge', 'StatusBadge', 'Avatar', 'AvatarGroup', 'UserCell', 'StatCard', 'ProgressBar', 'DetailsList', 'DateTimeDisplay', 'FilterChip', 'FilterBar', 'TableToolbar', 'DataTable', 'ReorderableDataTable', 'Pagination', 'DataView', 'SavedViewMenu', 'ColumnVisibilityMenu'], 'Scan, filter and act on operational information.'),
  ...define('workflow', ['DateRangePicker', 'HealthIndicator', 'Stepper', 'Timeline', 'TraceTree', 'TreeView', 'SplitPane', 'CodeBlock', 'JsonViewer', 'ChartCard', 'Sparkline', 'BarChart', 'MetricStrip'], 'Explain execution state, relationships and trends.'),
  ...define('business', ['ScoringStatus', 'ScoringPlan', 'RunMatrix', 'OperationPanel', 'CredentialCard', 'SecretReveal', 'WebhookEndpointCard', 'DeliveryAttempt', 'DeliveryInspector', 'PermissionMatrix', 'AuditEvent', 'TenantSummary', 'IncidentCard', 'JobIdentity', 'AuditTimeline', 'IntegrationLink'], 'Represent approved AI Scoring business concepts.'),
  ...define('templates', ['PageFrame', 'DashboardTemplate', 'ListPage', 'ListTemplate', 'FormTemplate', 'DetailTemplate', 'SettingsTemplate', 'BuilderTemplate', 'OperationsTemplate', 'TemplatePreview', 'SaveBar'], 'Compose future screens without creating one-off layouts.'),
]);
