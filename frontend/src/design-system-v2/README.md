# IIG frontend design system

This is the greenfield, reusable component library for IIG Admin. It does not import the legacy `src/components/ui` implementation.

## Consume components

Application code imports by component name from the public root:

```jsx
import { Button, Combobox, DataTable, Title } from '@/design-system-v2';
```

Do not import from `batch1`–`batch6`. Those folders are internal review fixtures kept temporarily so `/dev/components` can show the approved evolution of the system. They are not API boundaries and may move without notice.

## Source structure

- `components/`: one public component contract per file for newly added primitives; the public barrel also exposes reviewed primitives that are being migrated from gallery internals.
- `registry.js`: canonical component inventory by capability, not by batch.
- `tokens.css`: semantic color, typography, spacing, radius, control, content-width, shadow and motion tokens.
- `typography.css`: semantic HTML contract for headings, body text, labels, captions and code.
- `batch*/`: showcase markup and showcase-only styles. No reusable component implementation may live here.

## Typography

Choose a semantic element first. `h1`, `h2`, `h3`, `h4`, `p`, `label`, `small` and `code` map to a fixed token scale. Use `Title`, `Text`, `Label`, `Caption` and `CodeText` when a component abstraction is useful. Feature CSS must not invent font sizes.

## Desktop responsiveness

Components are designed and reviewed at 1024, 1280, 1440, 1600 and 1920 px. Content uses compact (960 px), standard (1280 px) and wide (1600 px) tokens. Grids reflow; dense tables use their own horizontal overflow region; navigation can collapse without hiding the primary task.

## Accessibility baseline

- Visible keyboard focus and accessible names are mandatory.
- Tabs, menus, dialogs and tables implement their ARIA and keyboard contracts.
- Dialogs trap focus, close on Escape and return focus.
- Motion respects `prefers-reduced-motion`; system colors remain legible in forced-colors mode.

## Inventory and testing

Use `componentRegistry` to inspect supported components and their intended category. Run:

```sh
npm run test:design-system
npm run lint
npm run build
```

The detailed FE rules and type table are in `docs/frontend-design-system.md`.

## Standard list page

All operational list screens use `ListPage` as the page contract and compose the shared `FilterBar`, `TableToolbar`, `DataTable` and `Pagination`. Do not recreate breadcrumbs, loading rows, empty states, sorting or pagination in feature code.

```jsx
<ListPage
  breadcrumb={[{ label: 'Trang chủ', to: '/' }, { label: 'Bài chấm' }]}
  breadcrumbLinkComponent={Link}
  title="Danh sách bài chấm"
  description="Theo dõi và xử lý bài thi."
  actions={<Button>Đồng bộ bài thi</Button>}
  toolbar={<>
    <TableToolbar title="Tất cả bài chấm" count={total} selection={selected.length} bulkActions={bulkActions} />
    <FilterBar search={query} onSearch={event => setQuery(event.target.value)} filters={filters} chips={chips} onClear={clearFilters} />
  </>}
  table={<DataTable
    ariaLabel="Danh sách bài chấm"
    columns={columns}
    rows={rows}
    loading={loading}
    error={error}
    emptyTitle="Chưa có bài chấm"
    emptyAction={<Button>Tạo bài chấm</Button>}
    selected={selected}
    onSelected={setSelected}
    sort={sort}
    onSort={setSort}
    manualSort
    getRowActions={row => buildActions(row)}
  />}
  pagination={<Pagination page={page} pageCount={pageCount} pageSize={pageSize} total={total} onPage={setPage} onPageSize={setPageSize} loading={loading} />}
/>
```

Column sorting defaults to client-side string sorting. Set `sortType` to `number` or `date`, or provide `sortValue`/`compare` for custom client sorting. For API-backed lists, provide controlled `sort` and `onSort`, and enable `manualSort` so the component does not reorder server results.

The table owns the visual state contract:

- `loading`: renders stable cell skeletons and disables sorting/selection.
- `error`: renders the shared error state with optional retry action.
- empty `rows`: renders the shared empty state with optional call to action.
- data: renders selection, keyboard row navigation and actions only when supplied.
