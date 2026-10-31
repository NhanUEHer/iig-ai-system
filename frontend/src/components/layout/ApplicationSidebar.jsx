import React from 'react';
import { Link } from 'react-router-dom';
import {
  Archive,
  BarChart3,
  BookOpen,
  Bot,
  Boxes,
  CircleHelp,
  FileKey,
  FileText,
  Gauge,
  GraduationCap,
  Library,
  ListChecks,
  Monitor,
  ReceiptText,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Upload,
  UserRound,
  UsersRound,
  WalletCards,
  Webhook,
  Workflow,
} from 'lucide-react';
import { Sidebar } from '../../design-system-v2';
import './ApplicationSidebar.css';

export const applicationNavigation = [
  {
    id: 'content',
    label: 'Nội dung',
    items: [
      { id: 'question-bank', label: 'Ngân hàng câu hỏi', to: '/question-bank', icon: Library, permissions: ['question_bank.view', 'question_bank.manage'] },
      { id: 'question-groups', label: 'Nhóm câu hỏi', to: '/question-bank/groups', icon: ListChecks, permissions: ['question_bank.view', 'question_bank.taxonomy_manage'] },
      { id: 'exams', label: 'Đề thi', to: '/exams', icon: FileText, permissions: ['exams.view', 'exams.manage'] },
      { id: 'exam-candidates', label: 'Thí sinh', to: '/exam-candidates', icon: UsersRound, permissions: ['exam_candidates.view', 'exam_candidates.export'] },
      { id: 'score-scales', label: 'Thang điểm', to: '/score-scales', icon: SlidersHorizontal, permissions: ['exams.view', 'exams.manage'] },
      { id: 'question-gen', label: 'Tạo câu hỏi', icon: CircleHelp, disabled: true, indicator: 'warning', permissions: ['audio.view', 'key_vocab.view', 'key_vocab.generate', 'key_vocab.manage'] },
    ],
  },
  {
    id: 'development',
    label: 'Tạo & phát triển',
    items: [
      { id: 'content-sources', label: 'Nguồn học liệu', to: '/content-sources', icon: Archive, permissions: ['content_sources.view', 'content_sources.create'] },
      { id: 'content-development', label: 'Phát triển học liệu', to: '/content-development', icon: BookOpen, permissions: ['content_sources.view', 'content_sources.analyze'] },
      { id: 'local-tts', label: 'Audio Studio', to: '/local-tts', icon: Sparkles, permission: 'audio.view' },
      { id: 'key-vocab', label: 'Tạo học liệu', to: '/key-vocab', icon: GraduationCap, permissions: ['key_vocab.view', 'key_vocab.generate', 'key_vocab.manage', 'dictionary.view', 'dictionary.generate', 'dictionary.manage'] },
    ],
  },
  {
    id: 'scoring',
    label: 'AI Scoring',
    items: [
      { id: 'submissions', label: 'Quản lý bài chấm', to: '/submissions', icon: Monitor, permission: 'submissions.view' },
      { id: 'ai-scoring-jobs', label: 'Scoring jobs', to: '/ai-scoring/jobs', icon: Workflow, permissions: ['ai_scoring.jobs.view', 'ai_scoring.jobs.export'] },
      { id: 'ai-scoring-tenants', label: 'Tenant tích hợp', to: '/ai-scoring/tenants', icon: Boxes, permissions: ['ai_scoring.tenants.view', 'ai_scoring.tenants.manage'] },
      { id: 'mappings', label: 'Đồng bộ Keycode', to: '/mappings', icon: Webhook, permission: 'mappings.view' },
      { id: 'ai', label: 'Cấu hình AI Agents', to: '/ai', icon: Bot, permission: 'agents.view' },
    ],
  },
  {
    id: 'reports',
    label: 'Báo cáo',
    items: [
      { id: 'report-kpi', label: 'Dashboard KPI', to: '/reports/kpi', icon: Gauge, permission: 'reports.view' },
      { id: 'report-manage', label: 'Quản lý báo cáo', to: '/reports/manage', icon: BarChart3, permissions: ['reports.forms.view', 'reports.entry', 'reports.review', 'reports.assign', 'reports.publish', 'reports.manage'] },
      { id: 'report-kpi-config', label: 'Cấu hình KPI', to: '/reports/kpi-config', icon: Settings, permission: 'reports.manage' },
    ],
  },
  {
    id: 'expenses',
    label: 'Chi phí',
    items: [
      { id: 'expenses', label: 'Import sao kê', to: '/expenses/imports', icon: Upload, permissions: ['expenses.view', 'expenses.import', 'expenses.manage'] },
      { id: 'expense-transactions', label: 'Giao dịch ngân hàng', to: '/expenses/transactions', icon: ReceiptText, permissions: ['expenses.view', 'expenses.manage'] },
      { id: 'expense-dashboard', label: 'Báo cáo chi phí', to: '/expenses/dashboard', icon: WalletCards, permissions: ['expenses.view', 'expenses.manage'] },
    ],
  },
  {
    id: 'administration',
    label: 'Quản trị',
    items: [
      { id: 'users', label: 'Tài khoản', to: '/users', icon: UserRound, permission: 'users.view' },
      { id: 'roles', label: 'Vai trò & phân quyền', to: '/roles', icon: ShieldCheck, permission: 'roles.view' },
      { id: 'logs', label: 'Nhật ký hệ thống', to: '/logs', icon: FileKey, permission: 'logs.view' },
    ],
  },
];

function canSee(item, permissions) {
  if (item.permission && !permissions.includes(item.permission)) return false;
  return !item.permissions || item.permissions.some(permission => permissions.includes(permission));
}

export default function ApplicationSidebar({ collapsed, onCollapsedChange, activeTab, currentUser }) {
  const permissions = currentUser?.permissions || [];
  const groups = applicationNavigation
    .map(group => ({
      ...group,
      items: group.items.filter(item => canSee(item, permissions)).map(item => ({ ...item, active: item.id === activeTab })),
    }))
    .filter(group => group.items.length);
  return <Sidebar
    brand="I - Agentic"
    brandMark={<img src="/IIG_logo.webp" alt="IIG" />}
    workspace={{ name: 'IIG Vietnam', description: 'AI Scoring workspace', logo: 'IV', disabled: true }}
    groups={groups}
    collapsed={collapsed}
    onCollapsedChange={onCollapsedChange}
    LinkComponent={Link}
  />;
}
