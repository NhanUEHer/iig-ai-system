import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createDetailRow, createKpiConfig, getReportMasterData, listDetailRows, listKpiConfig,
  reorderDetailRows, reorderKpiConfig, updateDetailRow, updateKpiConfig,
} from './kpiConfigurationService';
import { detailSectionsFor, KPI_TEAMS } from './constants';

const message = (error, fallback) => error.response?.data?.error || fallback;

export function useKpiConfiguration(showMsg) {
  const notify = useRef(showMsg);
  const [team, setTeam] = useState('REV');
  const [catalogs, setCatalogs] = useState({});
  const [detailItems, setDetailItems] = useState([]);
  const [masterData, setMasterData] = useState({});
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { notify.current = showMsg; }, [showMsg]);

  const loadCatalogs = useCallback(async () => {
    setCatalogLoading(true); setCatalogError('');
    try {
      const entries = await Promise.all(KPI_TEAMS.map(async item => [item.value, await listKpiConfig(item.value)]));
      setCatalogs(Object.fromEntries(entries));
    } catch (error) { setCatalogError(message(error, 'Không thể tải danh mục KPI.')); }
    finally { setCatalogLoading(false); }
  }, []);

  const loadDetails = useCallback(async selectedTeam => {
    setDetailLoading(true); setDetailError('');
    try { setDetailItems(await listDetailRows(selectedTeam) || []); }
    catch (error) { setDetailError(message(error, 'Không thể tải cấu hình dòng chi tiết.')); }
    finally { setDetailLoading(false); }
  }, []);

  useEffect(() => { loadCatalogs(); getReportMasterData().then(setMasterData).catch(() => setMasterData({})); }, [loadCatalogs]);
  useEffect(() => { loadDetails(team); }, [loadDetails, team]);

  const items = useMemo(() => catalogs[team] || [], [catalogs, team]);
  const activeItems = useMemo(() => items.filter(item => item.is_active), [items]);
  const counts = useMemo(() => Object.fromEntries(KPI_TEAMS.map(item => [item.value, (catalogs[item.value] || []).filter(row => row.is_active).length])), [catalogs]);
  const sections = useMemo(() => detailSectionsFor(team).map(section => ({
    ...section,
    rows: detailItems.filter(item => (item.section_key || 'primary') === section.key).sort((a, b) => Number(b.is_active) - Number(a.is_active) || Number(a.display_order) - Number(b.display_order)),
  })), [detailItems, team]);

  const reload = useCallback(async () => { await Promise.all([loadCatalogs(), loadDetails(team)]); }, [loadCatalogs, loadDetails, team]);
  const run = async (operation, success, fallback) => {
    setBusy(true);
    try { await operation(); notify.current?.(success, 'success'); await reload(); return true; }
    catch (error) { notify.current?.(message(error, fallback), 'error'); return false; }
    finally { setBusy(false); }
  };
  const saveKpi = (item, form) => run(
    () => item ? updateKpiConfig(item.id, form) : createKpiConfig({ teamCode: team, ...form }),
    item ? 'Đã cập nhật cấu hình KPI.' : 'Đã tạo KPI mới. Cấu hình áp dụng từ kỳ tạo tiếp theo.',
    'Không thể lưu cấu hình KPI.',
  );
  const toggleKpi = item => run(() => updateKpiConfig(item.id, {
    name: item.name, unit: item.unit, evaluationDirection: item.evaluation_direction,
    inputMode: item.input_mode || 'manual', formulaCode: item.formula_code || '', isActive: !item.is_active,
  }), item.is_active ? 'Đã ngừng sử dụng KPI.' : 'Đã kích hoạt lại KPI.', 'Không thể cập nhật trạng thái KPI.');
  const saveDetail = (item, form) => run(
    () => item ? updateDetailRow(item.id, form) : createDetailRow({ teamCode: team, ...form }),
    item ? 'Đã cập nhật dòng chi tiết.' : 'Đã tạo dòng chi tiết.',
    'Không thể lưu dòng chi tiết.',
  );
  const reorderKpis = async ({ orderedRows }) => {
    const previous = items;
    setCatalogs(current => ({ ...current, [team]: orderedRows }));
    try { await reorderKpiConfig(team, orderedRows.filter(item => item.is_active).map(item => item.id)); }
    catch (error) { setCatalogs(current => ({ ...current, [team]: previous })); notify.current?.(message(error, 'Không thể đổi thứ tự KPI.'), 'error'); }
  };
  const reorderDetails = async (sectionKey, { orderedRows }) => {
    const previous = detailItems;
    const ranks = new Map(orderedRows.map((item, index) => [item.id, index + 1]));
    setDetailItems(current => current.map(item => ranks.has(item.id) ? { ...item, display_order: ranks.get(item.id) } : item));
    try { await reorderDetailRows(team, sectionKey, orderedRows.filter(item => item.is_active).map(item => item.id)); }
    catch (error) { setDetailItems(previous); notify.current?.(message(error, 'Không thể đổi thứ tự dòng chi tiết.'), 'error'); }
  };

  return { team, setTeam, items, activeItems, counts, sections, masterData, catalogLoading, detailLoading, catalogError, detailError, busy, reload, loadCatalogs, loadDetails: () => loadDetails(team), saveKpi, toggleKpi, saveDetail, reorderKpis, reorderDetails };
}
