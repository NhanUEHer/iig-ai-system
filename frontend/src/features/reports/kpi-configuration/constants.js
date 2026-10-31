import { BarChart3, CircleDollarSign, GraduationCap, Handshake, Megaphone, Package } from 'lucide-react';

export const KPI_TEAMS = [
  { value: 'REV', label: 'Doanh thu', icon: CircleDollarSign },
  { value: 'ADS', label: 'Marketing Ads', icon: BarChart3 },
  { value: 'COM', label: 'Truyền thông', icon: Megaphone },
  { value: 'TRADE', label: 'Trade', icon: Handshake },
  { value: 'TRAIN', label: 'Đào tạo', icon: GraduationCap },
  { value: 'PROD', label: 'Sản phẩm', icon: Package },
];

export const EVALUATION_DIRECTIONS = [
  { value: 'increase_good', label: 'Tăng tốt' },
  { value: 'decrease_good', label: 'Giảm tốt' },
  { value: 'monitor', label: 'Theo dõi' },
];

export const KPI_FORMULAS = {
  REV: ['DT_01', 'DT_03', 'DT_04'],
  ADS: ['ADS_01', 'ADS_02', 'ADS_03', 'ADS_04', 'ADS_05', 'ADS_06', 'ADS_07'],
  COM: ['TT_01', 'TT_02', 'TT_03', 'TT_04', 'TT_05', 'TT_06', 'TT_07', 'TT_08', 'TT_09'],
  TRADE: ['TRADE_03', 'TRADE_04', 'TRADE_05', 'TRADE_07', 'TRADE_08', 'TRADE_09', 'TRADE_10', 'TRADE_11'],
  TRAIN: ['DAO_01', 'DAO_02', 'DAO_03', 'DAO_04', 'DAO_05', 'DAO_06', 'DAO_07', 'DAO_09'],
  PROD: ['SP_01', 'SP_02', 'SP_03', 'SP_04', 'SP_05'],
};

export const TEMPLATE_ROW_TEAMS = new Set(['REV', 'ADS', 'COM', 'TRAIN']);
export const SOURCE_LABELS = { manual: 'Nhập tay', derived: 'Công thức', previous_period: 'Lấy kỳ trước', formula: 'Công thức' };

export const detailSectionsFor = team => team === 'ADS'
  ? [
    { key: 'traffic', title: 'Chi tiết theo nguồn Traffic', description: 'Thứ tự nguồn traffic trong phiếu nhập liệu.' },
    { key: 'products', title: 'Tỷ trọng Ads theo sản phẩm', description: 'Thứ tự sản phẩm trong khối phân bổ Ads.' },
  ]
  : [{ key: 'primary', title: '', description: '' }];
