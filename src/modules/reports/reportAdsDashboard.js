const numberOrNull = value => value === null || value === undefined || value === '' ? null : Number(value);
const sum = (rows, key) => rows.reduce((total, row) => total + (numberOrNull(row[key]) || 0), 0);
const ratio = (value, base) => base ? value / base : null;
const change = (value, base) => base ? (value - base) / Math.abs(base) : null;
const money = value => {
  const amount = numberOrNull(value) || 0;
  if (Math.abs(amount) >= 1e9) return `${(amount / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ`;
  if (Math.abs(amount) >= 1e6) return `${(amount / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} triệu`;
  return `${amount.toLocaleString('vi-VN')} đ`;
};

function channelStatus(channel) {
  if (!channel.spend) return { key: 'no_spend', label: 'Chưa ghi nhận chi phí', tone: 'muted' };
  if (channel.budgetCompletion > 1.1) return { key: 'overspent', label: 'Vượt ngân sách', tone: 'danger' };
  if (channel.closingRate !== null && channel.closingRate < 0.05) return { key: 'weak_conversion', label: 'Chốt thấp', tone: 'warning' };
  if (channel.roas !== null && channel.roas >= 2) return { key: 'efficient', label: 'Hiệu quả tốt', tone: 'success' };
  return { key: 'watch', label: 'Cần theo dõi', tone: 'neutral' };
}

function buildAdsInsights(channels = []) {
  const overspent = channels.filter(item => item.budgetTarget > 0 && item.budgetCompletion > 1).sort((a, b) => b.budgetCompletion - a.budgetCompletion)[0];
  const weakClose = channels.filter(item => item.leads > 0).sort((a, b) => a.closingRate - b.closingRate)[0];
  const bestRoas = channels.filter(item => item.spend > 0).sort((a, b) => b.roas - a.roas)[0];
  return [
    overspent && { tone: 'danger', channel: overspent.name, title: `${overspent.name} vượt ngân sách`, value: overspent.budgetCompletion - 1, detail: `Chi phí ${money(overspent.spend)} so với ngân sách ${money(overspent.budgetTarget)}.` },
    weakClose && { tone: 'warning', channel: weakClose.name, title: `${weakClose.name} có tỷ lệ chốt thấp nhất`, value: weakClose.closingRate, detail: 'Thấp hơn mức chuyển đổi chung, cần rà soát chất lượng lead.' },
    bestRoas && { tone: 'success', channel: bestRoas.name, title: `${bestRoas.name} mang lại doanh thu/chi phí tốt nhất`, value: bestRoas.roas, detail: `ROAS đạt ${bestRoas.roas.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} lần, cao nhất trong các nguồn.` }
  ].filter(Boolean);
}

function buildAdsDashboard(dashboard) {
  const rows = dashboard?.details || [];
  const kpis = dashboard?.kpis || [];
  const kpi = code => kpis.find(item => item.code === code) || {};
  const budgetTarget = sum(rows, 'budget_target');
  const spend = sum(rows, 'budget_actual') || (numberOrNull(kpi('ADS_05').actual_value) || 0);
  const leads = sum(rows, 'lead_count') || (numberOrNull(kpi('ADS_02').actual_value) || 0);
  const orders = sum(rows, 'order_count') || (numberOrNull(kpi('ADS_03').actual_value) || 0);
  const revenue = sum(rows, 'revenue') || (numberOrNull(kpi('ADS_01').actual_value) || 0);
  const previousSpend = numberOrNull(kpi('ADS_05').previous_value);
  const previousLeads = numberOrNull(kpi('ADS_02').previous_value);
  const previousOrders = numberOrNull(kpi('ADS_03').previous_value);
  const previousRevenue = sum(rows, 'previous_revenue') || (numberOrNull(kpi('ADS_01').previous_value) || 0);
  const channels = rows.map(row => {
    const channelSpend = numberOrNull(row.budget_actual) || 0;
    const target = numberOrNull(row.budget_target) || 0;
    const channelLeads = numberOrNull(row.lead_count) || 0;
    const channelOrders = numberOrNull(row.order_count) || 0;
    const channelRevenue = numberOrNull(row.revenue) || 0;
    const channel = {
      id: row.id || row.row_key,
      name: row.traffic_source || 'Khác',
      budgetTarget: target,
      spend: channelSpend,
      leads: channelLeads,
      orders: channelOrders,
      revenue: channelRevenue,
      budgetCompletion: ratio(channelSpend, target),
      closingRate: ratio(channelOrders, channelLeads),
      roas: ratio(channelRevenue, channelSpend),
      cpl: ratio(channelSpend, channelLeads),
      cpa: ratio(channelSpend, channelOrders),
      revenueShare: ratio(channelRevenue, revenue)
    };
    channel.status = channelStatus(channel);
    return channel;
  }).sort((a, b) => b.revenue - a.revenue);
  const productRows = dashboard?.detailSections?.find(section => section.key === 'adsProducts')?.rows || [];
  const products = productRows.map(row => ({
    id: row.id || row.row_key,
    name: row.product_name || 'Khác',
    group: row.product_group || 'Khác',
    spend: numberOrNull(row.ad_cost) || 0,
    revenue: numberOrNull(row.revenue) || 0,
    leads: numberOrNull(row.lead_count) || 0,
    qualifiedLeads: numberOrNull(row.qualified_lead_count) || 0,
    orders: numberOrNull(row.order_count) || 0
  }));
  const totalProductSpend = sum(products, 'spend');
  const totalProductRevenue = sum(products, 'revenue');
  const qualifiedLeads = sum(products, 'qualifiedLeads');
  products.forEach(item => {
    item.spendShare = ratio(item.spend, totalProductSpend);
    item.revenueShare = ratio(item.revenue, totalProductRevenue);
    item.roas = ratio(item.revenue, item.spend);
  });
  products.sort((a, b) => b.revenue - a.revenue);
  const leadChange = change(leads, previousLeads);
  const orderChange = change(orders, previousOrders);
  const revenueChange = change(revenue, previousRevenue);
  const hasLeadQualityRisk = leadChange > 0 && (orderChange < 0 || revenueChange < 0);
  const revenueDifference = totalProductRevenue - revenue;
  const revenueDifferenceRate = ratio(Math.abs(revenueDifference), revenue);
  return {
    period: dashboard.period,
    metrics: {
      budget: { value: budgetTarget },
      spend: { value: spend, target: budgetTarget, completion: ratio(spend, budgetTarget), previous: previousSpend, change: change(spend, previousSpend) },
      leads: { value: leads, previous: previousLeads, change: leadChange },
      qualifiedLeads: { value: qualifiedLeads, rate: ratio(qualifiedLeads, leads), coverage: products.length ? 'product' : 'none' },
      orders: { value: orders, previous: previousOrders, change: orderChange },
      closingRate: { value: ratio(orders, leads) },
      revenue: { value: revenue, previous: previousRevenue, change: revenueChange },
      cpl: { value: ratio(spend, leads) },
      cpa: { value: ratio(spend, orders) },
      roas: { value: ratio(revenue, spend) }
    },
    businessSummary: {
      hasLeadQualityRisk,
      leadingChannel: channels[0] || null,
      overspend: Math.max(0, spend - budgetTarget),
      message: hasLeadQualityRisk
        ? 'Lead tăng nhưng đơn hàng hoặc doanh thu giảm; điểm nghẽn nằm ở chất lượng lead và chuyển đổi.'
        : 'Theo dõi đồng thời mức sử dụng ngân sách, tỷ lệ chốt và ROAS để ưu tiên kênh hiệu quả.'
    },
    reconciliation: {
      channelRevenue: revenue,
      productRevenue: totalProductRevenue,
      revenueDifference,
      revenueDifferenceRate,
      productSpend: totalProductSpend,
      productSpendCoverage: ratio(totalProductSpend, spend),
      hasRevenueMismatch: revenueDifferenceRate !== null && revenueDifferenceRate > 0.01
    },
    channels,
    products,
    insights: buildAdsInsights(channels),
    source: { channelRows: rows.length, productRows: products.length, kpis: kpis.map(item => item.code) }
  };
}

module.exports = { buildAdsDashboard, buildAdsInsights, channelStatus };
