const numberOrNull = value => value === null || value === undefined || value === '' ? null : Number(value);
const sum = (rows, key) => rows.reduce((total, row) => total + (numberOrNull(row[key]) || 0), 0);
const ratio = (value, base) => base ? value / base : null;
const change = (value, base) => base ? (value - base) / Math.abs(base) : null;

function buildCommunicationInsights(channels = [], context = {}) {
  const videoLeader = [...channels].filter(item => item.videoViews > 0).sort((a, b) => b.videoViews - a.videoViews)[0];
  const engagementLeader = [...channels].filter(item => item.engagementRate !== null).sort((a, b) => b.engagementRate - a.engagementRate)[0];
  const reachDecline = [...channels].filter(item => item.reachChange !== null && item.reachChange < 0).sort((a, b) => a.reachChange - b.reachChange)[0];
  const missingReach = channels.filter(item => item.dataQuality?.key === 'missing_reach');
  const topTwoReachShare = channels.slice(0, 2).reduce((total, item) => total + (item.reachShare || 0), 0);
  return [
    context.hasConversionRisk && { type: 'conversion', tone: 'danger', title: 'Độ phủ tăng nhưng Lead suy giảm', detail: 'Cần ưu tiên chất lượng nội dung chuyển đổi và lời kêu gọi hành động.' },
    videoLeader && { type: 'video', tone: 'highlight', channel: videoLeader.name, title: `${videoLeader.name} tạo ${Math.round(videoLeader.videoShare * 100)}% tổng video view`, detail: 'Kênh đóng góp lượt xem video lớn nhất trong kỳ.' },
    engagementLeader && { type: 'engagement', tone: 'success', channel: engagementLeader.name, title: `${engagementLeader.name} có engagement rate cao nhất`, value: engagementLeader.engagementRate, detail: 'Nội dung trên kênh đang thu hút tương tác tốt.' },
    topTwoReachShare >= 0.8 && { type: 'concentration', tone: 'warning', title: `${Math.round(topTwoReachShare * 100)}% Reach tập trung ở 2 kênh đầu`, value: topTwoReachShare, detail: 'Cần theo dõi rủi ro phụ thuộc kênh và phương án phân bổ nội dung.' },
    missingReach.length && { type: 'data_quality', tone: 'warning', title: `${missingReach.length} kênh có Lead nhưng thiếu Reach`, detail: `Cần bổ sung dữ liệu đầu phễu cho ${missingReach.map(item => item.name).join(', ')}.` },
    !context.hasConversionRisk && reachDecline && { type: 'decline', tone: 'danger', channel: reachDecline.name, title: `${reachDecline.name} Reach giảm so với tháng trước`, value: reachDecline.reachChange, detail: 'Cần rà soát nội dung và tần suất đăng.' }
  ].filter(Boolean).slice(0, 5);
}

function buildCommunicationDashboard({ dashboard, monthly = [] }) {
  const rows = dashboard?.details || [];
  const kpis = dashboard?.kpis || [];
  const kpi = code => kpis.find(item => item.code === code) || {};
  const followers = sum(rows, 'followers_current');
  const previousFollowers = sum(rows, 'followers_previous');
  const reach = sum(rows, 'reach_current');
  const previousReach = sum(rows, 'reach_previous');
  const videoViews = sum(rows, 'video_views');
  const engagementsRaw = sum(rows, 'engagement_count');
  const leads = sum(rows, 'lead_count');
  const revenue = sum(rows, 'revenue');
  const postCount = sum(rows, 'social_post_count');
  const engagementRate = numberOrNull(kpi('TT_05').actual_value) ?? ratio(engagementsRaw, reach);
  const engagements = engagementsRaw || (engagementRate !== null ? Math.round(reach * engagementRate) : 0);
  const previousEngagementRate = numberOrNull(kpi('TT_05').previous_value);
  const previousLeads = numberOrNull(kpi('TT_07').previous_value);
  const reachChange = change(reach, previousReach);
  const leadChange = change(leads, previousLeads);
  const channels = rows.map(row => {
    const channelReach = numberOrNull(row.reach_current) || 0;
    const oldReach = numberOrNull(row.reach_previous) || 0;
    const views = numberOrNull(row.video_views) || 0;
    const channelLeads = numberOrNull(row.lead_count) || 0;
    const dataQuality = channelLeads > 0 && channelReach === 0
      ? { key: 'missing_reach', label: 'Thiếu Reach', tone: 'warning' }
      : { key: 'complete', label: 'Đủ dữ liệu', tone: 'success' };
    return {
      id: row.id || row.row_key,
      name: row.channel_name || 'Khác',
      followers: numberOrNull(row.followers_current) || 0,
      reach: channelReach,
      previousReach: oldReach,
      reachChange: change(channelReach, oldReach),
      videoViews: views,
      engagements: numberOrNull(row.engagement_count) || 0,
      engagementRate: numberOrNull(row.engagement_rate),
      leads: channelLeads,
      leadRate: ratio(channelLeads, channelReach),
      revenue: numberOrNull(row.revenue) || 0,
      posts: numberOrNull(row.social_post_count) || 0,
      reachShare: ratio(channelReach, reach),
      videoShare: ratio(views, videoViews),
      dataQuality
    };
  }).sort((a, b) => b.reach - a.reach);
  const hasConversionRisk = reachChange > 0 && leadChange < 0;
  const businessSummary = {
    hasConversionRisk,
    message: hasConversionRisk
      ? 'Độ phủ và lượt xem tăng nhưng Lead giảm; hiệu quả chuyển đổi nội dung đang suy yếu.'
      : 'Theo dõi đồng thời độ phủ, tương tác và tỷ lệ tạo Lead để đánh giá chất lượng truyền thông.',
    topReachChannel: channels[0] || null,
    topTwoReachShare: channels.slice(0, 2).reduce((total, item) => total + (item.reachShare || 0), 0),
    missingReachChannels: channels.filter(item => item.dataQuality.key === 'missing_reach').length
  };
  return {
    period: dashboard.period,
    metrics: {
      followers: { value: followers, previous: previousFollowers, change: change(followers, previousFollowers) },
      reach: { value: reach, previous: previousReach, change: reachChange },
      videoViews: { value: videoViews, previous: numberOrNull(kpi('TT_06').previous_value), change: change(videoViews, numberOrNull(kpi('TT_06').previous_value)) },
      engagementRate: { value: engagementRate, previous: previousEngagementRate, change: change(engagementRate, previousEngagementRate) },
      engagements: { value: engagements, rate: ratio(engagements, reach) },
      leads: { value: leads, previous: previousLeads, change: leadChange, rateFromReach: ratio(leads, reach), rateFromEngagement: ratio(leads, engagements) },
      revenue: { value: revenue, perLead: ratio(revenue, leads) },
      posts: { value: postCount, reachPerPost: ratio(reach, postCount), leadsPerPost: ratio(leads, postCount) }
    },
    businessSummary,
    monthly: monthly.map(row => ({ year: Number(row.year), month: Number(row.month), followers: numberOrNull(row.followers), reach: numberOrNull(row.reach) })),
    channels,
    insights: buildCommunicationInsights(channels, { hasConversionRisk }),
    source: { channelRows: rows.length, kpis: kpis.map(item => item.code) }
  };
}

module.exports = { buildCommunicationDashboard, buildCommunicationInsights };
