import React, { useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import {
  Alert, Button, ConfirmDialog, EmptyState, PageFrame, PageHeader, Surface, TableToolbar, Tabs,
} from '../../../design-system-v2';
import DetailRowEditorModal from '../kpi-configuration/components/DetailRowEditorModal';
import DetailRowSection from '../kpi-configuration/components/DetailRowSection';
import KpiCatalogTable from '../kpi-configuration/components/KpiCatalogTable';
import KpiEditorModal from '../kpi-configuration/components/KpiEditorModal';
import { KPI_TEAMS, TEMPLATE_ROW_TEAMS } from '../kpi-configuration/constants';
import { useKpiConfiguration } from '../kpi-configuration/useKpiConfiguration';
import './KpiConfigurationPage.css';

export default function KpiConfigurationPage({ showMsg }) {
  const state = useKpiConfiguration(showMsg);
  const [editingKpi, setEditingKpi] = useState(undefined);
  const [editingDetail, setEditingDetail] = useState(undefined);
  const [pendingToggle, setPendingToggle] = useState(null);
  const activeTeam = KPI_TEAMS.find(item => item.value === state.team);
  const inactiveCount = state.items.length - state.activeItems.length;
  const hasTemplateRows = TEMPLATE_ROW_TEAMS.has(state.team);
  const tabs = KPI_TEAMS.map(item => {
    const Icon = item.icon;
    return { value: item.value, label: item.label, icon: <Icon />, count: state.counts[item.value] || 0 };
  });
  const closeKpi = () => setEditingKpi(undefined);
  const closeDetail = () => setEditingDetail(undefined);
  const confirmToggle = async () => {
    if (!pendingToggle) return;
    const success = await state.toggleKpi(pendingToggle);
    if (success) setPendingToggle(null);
  };

  return <div className="kpi-config-page"><PageFrame
    breadcrumb={[{ label: 'Báo cáo' }, { label: 'Cấu hình KPI' }]}
    header={<PageHeader title="Danh mục chỉ số KPI" />}
  >
    <Alert tone="info" title="Thay đổi chỉ áp dụng cho kỳ báo cáo được tạo mới">KPI trong các kỳ đã tạo được giữ nguyên để bảo toàn dữ liệu so sánh và lịch sử báo cáo.</Alert>
    <div className="kpi-config-tabs"><Tabs variant="contained" value={state.team} onChange={state.setTeam} items={tabs} /></div>

    <Surface padding="none" className="kpi-config-section">
      <TableToolbar
        title={`Bộ chỉ số ${activeTeam?.label || ''}`}
        count={state.activeItems.length}
        loading={state.catalogLoading}
        view={inactiveCount > 0 ? <span className="kpi-config-section__meta">{inactiveCount} đã ngừng</span> : null}
        actions={<><Button variant="outline" size="sm" icon={<RefreshCw />} loading={state.catalogLoading} onClick={state.reload}>Làm mới</Button><Button size="sm" icon={<Plus />} onClick={() => setEditingKpi(null)}>Thêm KPI</Button></>}
      />
      <Alert compact tone="info" title="Cấu trúc được khóa theo từng kỳ">Chỉ kỳ báo cáo tạo mới nhận cấu hình và thứ tự hiện tại.</Alert>
      <KpiCatalogTable items={state.items} loading={state.catalogLoading} error={state.catalogError} busy={state.busy} onRetry={state.loadCatalogs} onEdit={setEditingKpi} onToggle={item => item.is_active ? setPendingToggle(item) : state.toggleKpi(item)} onReorder={state.reorderKpis} />
    </Surface>

    <Surface padding="none" className="kpi-config-section">
      <header className="kpi-config-section__header"><div><strong>{hasTemplateRows ? 'Danh sách dòng mẫu' : 'Dòng phát sinh theo kỳ'}</strong><p>{hasTemplateRows ? 'Bộ cột được cố định theo loại báo cáo; sắp xếp các dòng trong từng khối.' : 'Loại báo cáo này dùng dòng nghiệp vụ phát sinh, không sinh sẵn danh sách dòng cố định.'}</p></div>{hasTemplateRows && <Button size="sm" icon={<Plus />} onClick={() => setEditingDetail(null)}>Thêm dòng</Button>}</header>
      {hasTemplateRows ? <div className="kpi-config-details">{state.sections.map(section => <DetailRowSection key={section.key} section={section} team={state.team} loading={state.detailLoading} error={state.detailError} busy={state.busy} onRetry={state.loadDetails} onEdit={setEditingDetail} onReorder={state.reorderDetails} />)}</div> : <EmptyState title="Không dùng dòng mẫu" description="Dữ liệu chi tiết được nhập trực tiếp trong từng kỳ báo cáo." />}
    </Surface>

    <KpiEditorModal open={editingKpi !== undefined} item={editingKpi || null} team={state.team} masterData={state.masterData} busy={state.busy} onClose={closeKpi} onSave={state.saveKpi} />
    <DetailRowEditorModal open={editingDetail !== undefined} item={editingDetail || null} team={state.team} masterData={state.masterData} busy={state.busy} onClose={closeDetail} onSave={state.saveDetail} />
    <ConfirmDialog open={Boolean(pendingToggle)} title="Ngừng sử dụng KPI?" description={pendingToggle ? `KPI ${pendingToggle.code} sẽ bị ngừng sử dụng. Các kỳ đã tạo không bị thay đổi.` : ''} confirmLabel="Ngừng sử dụng" danger loading={state.busy} onClose={() => setPendingToggle(null)} onConfirm={confirmToggle} />
  </PageFrame></div>;
}
