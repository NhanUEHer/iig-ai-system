import React from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { Alert, Button, EmptyState, Spinner, StatusBadge } from '../../../design-system-v2';

export const STATUS = {
  queued: { tone: 'queued', label: 'Đang chờ' },
  generating: { tone: 'processing', label: 'Đang tạo' },
  needs_review: { tone: 'warning', label: 'Cần xem lại' },
  ready: { tone: 'completed', label: 'Hoàn tất' },
  failed: { tone: 'failed', label: 'Lỗi' },
};
export const isBusy = artifact => ['queued', 'generating'].includes(artifact?.status);

// Frame for one artifact: status, validation issues and regenerate. Saving is global for the page.
export default function ArtifactShell({ artifact, label, dirty, shell, children }) {
  if (!artifact) {
    return <EmptyState icon={<Sparkles />} title={`Chưa tạo ${label}`} description="Nội dung này chưa được tạo cho học liệu."
      action={shell.canGenerate ? <Button size="sm" icon={<Sparkles />} onClick={shell.onGenerate}>Tạo {label}</Button> : null} />;
  }
  if (isBusy(artifact) && !artifact.content) {
    return <div className="cs-artifact__busy"><Spinner label={`${STATUS[artifact.status].label} ${label}…`} /></div>;
  }
  const issues = artifact.validation?.issues || [];
  return <div className="cs-artifact">
    <div className="cs-artifact__bar">
      <StatusBadge status={STATUS[artifact.status]?.tone} label={STATUS[artifact.status]?.label} />
      {artifact.source && <small>{artifact.source === 'human' ? 'Đã chỉnh tay' : `AI · ${artifact.provider || ''}`}</small>}
      {dirty && <em className="cs-dirty">Chưa lưu</em>}
      <span className="cs-artifact__spacer" />
      {shell.canGenerate && <Button variant="ghost" size="sm" icon={<RefreshCw />} disabled={isBusy(artifact)} onClick={() => shell.onRegenerate(artifact)}>Tạo lại</Button>}
    </div>
    {artifact.status === 'failed' && <Alert tone="danger" compact title="Tạo thất bại">{artifact.error || 'Không rõ lỗi.'}</Alert>}
    {issues.length > 0 && <Alert tone="warning" compact title={`${issues.length} điểm cần xem lại`}>
      <ul className="cs-issues">{issues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul>
    </Alert>}
    {isBusy(artifact) && <Alert tone="info" compact title="Đang tạo lại">Nội dung bên dưới là bản trước, sẽ được cập nhật khi tạo xong.</Alert>}
    {children}
  </div>;
}
