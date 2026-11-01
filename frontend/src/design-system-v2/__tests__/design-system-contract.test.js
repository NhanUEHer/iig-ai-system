import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { componentCategories, componentRegistry } from '../registry.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = path => readFileSync(join(root, path), 'utf8');

test('legacy design implementation is removed', () => {
  ['components.jsx', 'ShowcasePage.jsx', 'styles.css', 'showcase.css'].forEach(file => assert.equal(existsSync(join(root, file)), false));
});

test('batch folders contain showcases only', () => {
  for (let batch = 1; batch <= 5; batch += 1) {
    assert.equal(existsSync(join(root, `batch${batch}/Batch${batch}.jsx`)), false);
    assert.equal(existsSync(join(root, `batch${batch}/batch${batch}.css`)), false);
  }
});

test('public API is component based and covers required families', () => {
  const source = read('components/index.js');
  ['foundation/Typography', 'forms/Combobox', 'forms/MultiSelect', 'disclosure/Accordion', 'data/UploadProgress', 'forms/KeyValueEditor', 'feedback/NotificationList'].forEach(path => assert.match(source, new RegExp(path)));
});

test('component inventory has unique names and documented categories', () => {
  const names = componentRegistry.map(component => component.name);
  assert.equal(new Set(names).size, names.length);
  componentRegistry.forEach(component => {
    assert.ok(componentCategories[component.category], `${component.name} category`);
    assert.equal(component.importFrom, '@/design-system-v2');
  });
});

test('semantic tokens define typography and responsive content widths', () => {
  const source = read('tokens.css');
  ['--iig3-text-h1', '--iig3-text-h2', '--iig3-text-body', '--iig3-text-label', '--iig3-content-compact', '--iig3-content-wide'].forEach(token => assert.ok(source.includes(token), token));
});

test('high-risk interactive primitives expose accessibility contracts', () => {
  const batch1 = read('components/primitives/Primitives.jsx'); const batch2 = read('components/navigation/Navigation.jsx');
  ['aria-modal', 'aria-labelledby', 'aria-haspopup', "event.key === 'Escape'"].forEach(contract => assert.ok(batch1.includes(contract), contract));
  ['role="tablist"', 'aria-sort', "event.key === 'ArrowRight'"].forEach(contract => assert.ok(batch2.includes(contract), contract));
});

test('shared menu closes on outside interaction and Escape', () => {
  const source = read('components/primitives/Primitives.jsx');
  const floatingPortal = read('../components/common/FloatingPortal.jsx');
  const styles = read('components/primitives/primitives.css');
  assert.match(source, /<FloatingPortal open=\{open\}/);
  assert.match(source, /onDismiss=\{\(\) => setOpen\(false\)\}/);
  assert.match(source, /align=\{align\}/);
  assert.match(source, /role="menu"/);
  assert.match(floatingPortal, /document\.addEventListener\('pointerdown', outside\)/);
  assert.match(floatingPortal, /document\.addEventListener\('focusin', outside\)/);
  assert.match(floatingPortal, /event\.key === 'Escape'/);
  assert.match(floatingPortal, /anchorRef\.current\?\.contains\(event\.target\)/);
  assert.match(floatingPortal, /floatingRef\.current\?\.contains\(event\.target\)/);
  assert.match(floatingPortal, /createPortal\(/);
  assert.match(floatingPortal, /window\.addEventListener\('scroll', update, true\)/);
  assert.match(floatingPortal, /window\.innerWidth/);
  assert.match(floatingPortal, /window\.innerHeight/);
  assert.match(styles, /\.iig3-menu__portal\{position:fixed/);
});

test('production sidebar supports routes, hierarchy and responsive drawer', () => {
  const item = read('components/navigation/SidebarNavItem.jsx');
  const shell = read('components/navigation/AppShell.jsx');
  const styles = read('components/navigation/sidebar.css');
  ['aria-current', 'aria-expanded', 'LinkComponent', 'item.children'].forEach(contract => assert.ok(item.includes(contract), contract));
  ['sidebarCollapsed', 'mobileNavigationOpen', "event.key === 'Escape'"].forEach(contract => assert.ok(shell.includes(contract), contract));
  ['@media(max-width:900px)', 'has-mobile-navigation', '100dvh'].forEach(contract => assert.ok(styles.includes(contract), contract));
});

test('application header exposes shared search, status and compact account menu', () => {
  const source = read('components/navigation/ApplicationHeader.jsx');
  assert.match(source, /CommandSearch/);
  assert.match(source, /StatusBadge/);
  assert.match(source, /label: 'Hồ sơ'/);
  assert.match(source, /label: 'Đăng xuất'/);
  assert.match(source, /Menu align=/);
  assert.match(source, /metaKey \|\| event\.ctrlKey/);
});

test('standard list page covers navigation, filtering and resilient table states', () => {
  const navigation = read('components/navigation/Navigation.jsx');
  const templates = read('components/templates/PageTemplates.jsx');
  const templateStyles = read('components/templates/page-templates.css');
  const registryNames = componentRegistry.map(component => component.name);
  ['LinkComponent', 'aria-current', 'manualSort', 'onSort', 'loadingRows', 'EmptyState', 'ErrorState', 'pageSizeOptions', 'hideWhenEmpty', 'getRowActions'].forEach(contract => assert.ok(navigation.includes(contract), contract));
  ['ListPage', 'breadcrumbLinkComponent', 'dataLabel'].forEach(contract => assert.ok(templates.includes(contract), contract));
  ['iig3-list-screen', 'iig3-list-code', '--iig3-content-wide'].forEach(contract => assert.ok(templateStyles.includes(contract), contract));
  assert.ok(registryNames.includes('ListPage'));
});

test('production list screens use the canonical design-system shell', () => {
  [
    '../features/question-management/QuestionListPage.jsx',
    '../features/question-bank/pages/QuestionGroupManagementPage.jsx',
    '../features/exams/pages/ExamListPage.jsx',
    '../features/exam-candidates/pages/ExamCandidateListPage.jsx',
    '../features/score-scales/pages/ScoreScaleListPage.jsx',
  ].forEach(path => assert.match(read(path), /className="iig3-list-screen/));
});

test('list filters, dates and column visibility are reusable public components', () => {
  const source = read('components/index.js');
  const filter = read('components/forms/MultiSelectFilter.jsx');
  const floatingPortal = read('../components/common/FloatingPortal.jsx');
  const columns = read('components/data/ColumnVisibilityMenu.jsx');
  const date = read('components/data/DateTimeDisplay.jsx');
  ['forms/MultiSelectFilter', 'data/DateTimeDisplay', 'data/ColumnVisibilityMenu'].forEach(path => assert.match(source, new RegExp(path)));
  ['aria-multiselectable', 'FloatingPortal', 'onDismiss'].forEach(contract => assert.ok(filter.includes(contract), contract));
  ["event.key === 'Escape'", "document.addEventListener('pointerdown'"].forEach(contract => assert.ok(floatingPortal.includes(contract), contract));
  ['menuitemcheckbox', 'requiredKeys'].forEach(contract => assert.ok(columns.includes(contract), contract));
  ['Intl.DateTimeFormat', 'dateTime={date.toISOString()}'].forEach(contract => assert.ok(date.includes(contract), contract));
});

test('reorderable data table exposes pointer and keyboard ordering contracts', () => {
  const source = read('components/navigation/Navigation.jsx');
  const styles = read('components/navigation/navigation.css');
  const registryNames = componentRegistry.map(component => component.name);
  ['ReorderableDataTable', 'onReorder', 'isRowReorderable', 'orderedRows', 'orderedIds', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'draggable'].forEach(contract => assert.ok(source.includes(contract), contract));
  ['is-reorder', 'is-dragging', 'is-drop-target'].forEach(contract => assert.ok(styles.includes(contract), contract));
  assert.ok(registryNames.includes('ReorderableDataTable'));
});

test('data table supports accessible expanded detail rows', () => {
  const source = read('components/navigation/Navigation.jsx');
  ['isRowExpanded', 'renderExpandedRow', 'aria-expanded', 'iig3-data-table__expanded', 'colSpan={columnCount}'].forEach(contract => assert.ok(source.includes(contract), contract));
});

test('question list uses the shared list system and the backend query contract', () => {
  const source = read('../features/question-management/QuestionListPage.jsx');
  ['ListPage', 'FilterBar', 'MultiSelectFilter', 'DataTable', 'Pagination', 'DateTimeDisplay', 'ColumnVisibilityMenu'].forEach(component => assert.ok(source.includes(component), component));
  ['groupIds', 'questionTypes', 'statuses', 'sortBy', 'sortDirection', 'page', 'limit'].forEach(parameter => assert.ok(source.includes(parameter), parameter));
  ['question_name', 'updated_at', 'status', 'code'].forEach(sortField => assert.ok(source.includes(sortField), sortField));
  assert.doesNotMatch(source, /components\/ui/);
  assert.doesNotMatch(source, /QuestionBankRowActions/);
});

test('KPI configuration supports every reporting team through shared components and API services', () => {
  const page = read('../features/reports/pages/KpiConfigurationPage.jsx');
  const constants = read('../features/reports/kpi-configuration/constants.js');
  const hook = read('../features/reports/kpi-configuration/useKpiConfiguration.js');
  const service = read('../features/reports/kpi-configuration/kpiConfigurationService.js');
  const catalog = read('../features/reports/kpi-configuration/components/KpiCatalogTable.jsx');
  const details = read('../features/reports/kpi-configuration/components/DetailRowSection.jsx');

  ['PageFrame', 'PageHeader', 'Tabs', 'TableToolbar', 'ConfirmDialog'].forEach(component => assert.ok(page.includes(component), component));
  ['REV', 'ADS', 'COM', 'TRADE', 'TRAIN', 'PROD'].forEach(team => assert.ok(constants.includes(`value: '${team}'`), team));
  assert.match(hook, /Promise\.all\(KPI_TEAMS\.map/);
  assert.match(hook, /counts/);
  assert.match(catalog, /ReorderableDataTable/);
  assert.match(details, /ReorderableDataTable/);
  ['/reports/kpi-config', '/reports/kpi-config/order', '/reports/detail-row-config', '/reports/detail-row-config/order', '/reports/bootstrap'].forEach(endpoint => assert.ok(service.includes(endpoint), endpoint));
  assert.doesNotMatch(page, /services\/api/);
  assert.doesNotMatch(page, /<table/);
});

test('report period management uses the shared list system and preserves API workflows', () => {
  const page = read('../features/reports/pages/ReportPeriodManagementPage.jsx');
  const service = read('../features/reports/report-period-management/reportPeriodService.js');
  ['ListPage', 'StatCard', 'TableToolbar', 'DataTable', 'ProgressBar', 'DateTimeDisplay', 'StatusBadge', 'Modal', 'ConfirmDialog'].forEach(component => assert.ok(page.includes(component), component));
  ['/reports/manual/periods', '/assignee', '/deadline', '/publish', '/reopen'].forEach(endpoint => assert.ok(service.includes(endpoint), endpoint));
  assert.match(page, /renderExpandedRow/);
  assert.doesNotMatch(page, /services\/api/);
  assert.doesNotMatch(page, /<table/);
  assert.doesNotMatch(page, /useDialog/);
});

test('report entry and KPI dashboard compose shared design-system components', () => {
  const entry = read('../features/reports/pages/ManualReportPage.jsx');
  const dashboard = read('../features/reports/pages/KpiReportPage.jsx');
  ['PageHeader', 'Surface', 'StatusBadge', 'ProgressBar', 'Button', 'Alert', 'EmptyState'].forEach(component => assert.ok(entry.includes(component), `entry ${component}`));
  ['PageHeader', 'Tabs', 'Select', 'Button', 'Alert', 'EmptyState'].forEach(component => assert.ok(dashboard.includes(component), `dashboard ${component}`));
  assert.match(entry, /design-system-v2/);
  assert.match(dashboard, /design-system-v2/);
});
