import React from 'react';
import { RefreshCw, Save, Sparkles } from 'lucide-react';
import { Alert, Button, EmptyState, Spinner, StatusBadge } from '../../../design-system-v2';

export const STATUS = {
  queued: { tone: 'queued', label: 'Đang chờ' },
  generating: { tone: 'processing', label: 'Đang tạo' },
  needs_review: { tone: 'warning', label: 'Cần xem lại' },
  ready: { tone: 'completed', label: 'Hoàn tất' },
  failed: { tone: 'failed', label: 'Lỗi' },
};
export const isBusy = artifact => ['queued', 'generating'].includes(artifact?.status);

// Shared frame for one artifact: status, validation issues, save / regenerate actions.
export default function ArtifactShell({ artifact, label, dirty, saving, onSave, onRegenerate, onGenerate, canEdit, canGenerate, children, compact = false }) {
  if (!artifact) {
    return <EmptyState icon={<Sparkles />} title={`Chưa tạo ${label}`} description="Nội dung này chưa được tạo cho học liệu."
      action={canGenerate ? <Button size="sm" icon={<Sparkles />} onClick={onGenerate}>Tạo {label}</Button> : null} />;
  }
  if (isBusy(artifact) && !artifact.content) {
    return <div className="cs-artifact__busy"><Spinner label={`${STATUS[artifact.status].label} ${label}…`} /></div>;
  }
  const issues = artifact.validation?.issues || [];
  return <div className={`cs-artifact${compact ? ' is-compact' : ''}`}>
    <div className="cs-artifact__bar">
      <StatusBadge status={STATUS[artifact.status]?.tone} label={STATUS[artifact.status]?.label} />
      {artifact.source && <small>{artifact.source === 'human' ? 'Đã chỉnh tay' : `AI · ${artifact.provider || ''}`}</small>}
      <span className="cs-artifact__spacer" />
      {canGenerate && <Button variant="ghost" size="sm" icon={<RefreshCw />} disabled={isBusy(artifact) || saving} onClick={onRegenerate}>Tạo lại</Button>}
      {canEdit && onSave && <Button size="sm" icon={<Save />} loading={saving} disabled={!dirty || isBusy(artifact)} onClick={onSave}>Lưu thay đổi</Button>}
    </div>
    {artifact.status === 'failed' && <Alert tone="danger" compact title="Tạo thất bại">{artifact.error || 'Không rõ lỗi.'}</Alert>}
    {issues.length > 0 && <Alert tone="warning" compact title={`${issues.length} điểm cần xem lại`}>
      <ul className="cs-issues">{issues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul>
    </Alert>}
    {isBusy(artifact) && <Alert tone="info" compact title="Đang tạo lại">Nội dung bên dưới là bản trước, sẽ được cập nhật khi tạo xong.</Alert>}
    {children}
  </div>;
}
