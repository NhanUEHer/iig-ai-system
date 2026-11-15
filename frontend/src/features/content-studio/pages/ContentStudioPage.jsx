import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileText, ListChecks, RotateCcw, Save } from 'lucide-react';
import {
  Alert, Badge, Button, ConfirmDialog, DataTable, DateTimeDisplay, FileDropzone, FormField, Input, PageFrame, PageHeader,
  Select, StatusBadge, Surface, Textarea,
} from '../../../design-system-v2';
import { createItem, deleteItem, detectDocx, detectText, errorMessage, listFolders, listItems } from '../../../services/contentStudioService';
import FolderPanel from '../components/FolderPanel';
import { ALL_FOLDERS, UNFILED, buildFolderPath, flattenFolders } from '../folderTree';
import DetectionPreview from '../components/DetectionPreview';
import './ContentStudioPage.css';

const STATUS = {
  draft: { tone: 'draft', label: 'Nháp' }, generating: { tone: 'processing', label: 'Đang tạo' },
  needs_review: { tone: 'warning', label: 'Cần xem lại' }, ready: { tone: 'completed', label: 'Hoàn tất' }, failed: { tone: 'failed', label: 'Lỗi' },
};
const summaryLabel = summary => {
  if (!summary) return '—';
  const parts = [];
  if (summary.passageCount) parts.push(`${summary.passageCount} đoạn văn`);
  if (summary.questionCount) parts.push(`${summary.questionCount} câu hỏi${summary.questionRange ? ` (${summary.questionRange.from}–${summary.questionRange.to})` : ''}`);
  return parts.join(' · ') || '—';
};

export default function ContentStudioPage({ showMsg, permissions = {} }) {
  const [folders, setFolders] = useState([]);
  const [unfiledCount, setUnfiledCount] = useState(0);
  const [selectedFolder, setSelectedFolder] = useState(ALL_FOLDERS);
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemsError, setItemsError] = useState('');

  const [text, setText] = useState('');
  const [source, setSource] = useState({ kind: 'paste', fileName: null });
  const [detection, setDetection] = useState(null);
  const [detecting, setDetecting] = useState(false);
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [targetFolder, setTargetFolder] = useState('');
  const [saving, setSaving] = useState(false);
  const detectSeq = useRef(0);
  const showMsgRef = useRef(showMsg);
  useEffect(() => { showMsgRef.current = showMsg; }, [showMsg]);

  const loadFolders = useCallback(async () => {
    try {
      const result = await listFolders();
      setFolders(result.folders); setUnfiledCount(result.unfiledCount);
    } catch (error) { showMsgRef.current?.(errorMessage(error, 'Không thể tải thư mục.'), 'error'); }
  }, []);
  const loadItems = useCallback(async () => {
    setItemsLoading(true); setItemsError('');
    try { setItems(await listItems(selectedFolder === ALL_FOLDERS ? {} : { folderId: selectedFolder })); }
    catch (error) { setItemsError(errorMessage(error, 'Không thể tải danh sách học liệu.')); }
    finally { setItemsLoading(false); }
  }, [selectedFolder]);
  useEffect(() => { loadFolders(); }, [loadFolders]);
  useEffect(() => { loadItems(); }, [loadItems]);
  // New content is saved into the folder the user is browsing.
  useEffect(() => { setTargetFolder(selectedFolder === ALL_FOLDERS || selectedFolder === UNFILED ? '' : selectedFolder); }, [selectedFolder]);

  const applyDetection = useCallback(result => {
    setDetection(result);
    if (!titleTouched) setTitle(result?.title || '');
  }, [titleTouched]);

  // Auto-detect pasted text after the user pauses typing.
  useEffect(() => {
    if (source.kind === 'docx') return undefined;
    const value = text.trim();
    if (!value) { setDetection(null); return undefined; }
    const seq = ++detectSeq.current;
    const timer = setTimeout(async () => {
      setDetecting(true);
      try { const result = await detectText(value); if (seq === detectSeq.current) applyDetection(result); }
      catch (error) { if (seq === detectSeq.current) showMsgRef.current?.(errorMessage(error, 'Không thể nhận dạng nội dung.'), 'error'); }
      finally { if (seq === detectSeq.current) setDetecting(false); }
    }, 600);
    return () => clearTimeout(timer);
  }, [text, source.kind, applyDetection]);

  const onDocx = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setDetecting(true);
    try {
      const result = await detectDocx(file);
      detectSeq.current += 1;
      setSource({ kind: 'docx', fileName: result.fileName });
      setText(result.text);
      applyDetection(result.detection);
    } catch (error) { showMsg?.(errorMessage(error, 'Không thể đọc file DOCX.'), 'error'); }
    finally { setDetecting(false); }
  };

  const reset = () => {
    detectSeq.current += 1;
    setText(''); setSource({ kind: 'paste', fileName: null }); setDetection(null); setTitle(''); setTitleTouched(false);
  };

  const save = async () => {
    if (!detection?.segments?.length || saving) return;
    setSaving(true);
    try {
      await createItem({
        title: title.trim() || detection.title, folderId: targetFolder || null, sourceText: text,
        sourceKind: source.kind, sourceFileName: source.fileName, segments: detection.segments,
      });
      showMsg?.('Đã lưu học liệu.', 'success');
      reset();
      await Promise.all([loadItems(), loadFolders()]);
    } catch (error) { showMsg?.(errorMessage(error, 'Không thể lưu học liệu.'), 'error'); }
    finally { setSaving(false); }
  };

  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const removeItem = async () => {
    setDeleting(true);
    try { await deleteItem(pendingDelete.id); setPendingDelete(null); showMsg?.('Đã xoá học liệu.', 'success'); await Promise.all([loadItems(), loadFolders()]); }
    catch (error) { showMsg?.(errorMessage(error, 'Không thể xoá học liệu.'), 'error'); }
    finally { setDeleting(false); }
  };

  const folderOptions = useMemo(() => flattenFolders(folders), [folders]);
  const folderPath = useMemo(() => buildFolderPath(folders, selectedFolder), [folders, selectedFolder]);
  const folderLabel = selectedFolder === ALL_FOLDERS ? 'Tất cả học liệu' : selectedFolder === UNFILED ? 'Chưa phân loại' : folderPath.at(-1)?.name || 'Thư mục';
  const folderNames = useMemo(() => Object.fromEntries(folders.map(folder => [folder.id, folder.name])), [folders]);

  const columns = useMemo(() => [
    { key: 'title', label: 'Học liệu', render: row => <span className="cs-item-cell"><strong>{row.title}</strong>{selectedFolder === ALL_FOLDERS && <small>{row.folderId ? folderNames[row.folderId] || '—' : 'Chưa phân loại'}</small>}</span> },
    { key: 'summary', label: 'Nội dung', width: 240, render: row => summaryLabel(row.summary) },
    { key: 'status', label: 'Trạng thái', width: 140, render: row => <StatusBadge status={STATUS[row.status]?.tone} label={STATUS[row.status]?.label || row.status} /> },
    { key: 'updatedAt', label: 'Cập nhật', width: 170, render: row => <span className="cs-item-cell"><DateTimeDisplay value={row.updatedAt} /><small>{row.createdByName || ''}</small></span> },
  ], [folderNames, selectedFolder]);

  const canEdit = permissions.edit;
  const hasContent = Boolean(text.trim());

  return <PageFrame
    className="cs-page"
    breadcrumb={[{ label: 'Content Studio' }, ...(folderPath.length ? folderPath.map(folder => ({ label: folder.name })) : [{ label: folderLabel }])]}
    header={<PageHeader title="Content Studio" description="Dán đoạn văn và câu hỏi TOEIC LR hoặc tải file DOCX — hệ thống tự nhận diện, bạn xác nhận rồi lưu." />}
  >
    <div className="cs-layout">
      <div className="cs-main">
        {canEdit && <Surface className="cs-input" padding="lg">
          <div className="cs-input__head">
            <strong>Nhập nội dung</strong>
            {source.kind === 'docx' && <Badge tone="info" icon={<FileText />}>{source.fileName}</Badge>}
            {hasContent && <Button variant="ghost" size="sm" icon={<RotateCcw />} onClick={reset}>Làm lại</Button>}
          </div>
          <Textarea
            aria-label="Nội dung đoạn văn và câu hỏi"
            rows={hasContent ? 12 : 9}
            value={text}
            placeholder={'Dán đoạn văn, câu hỏi và đáp án vào đây…\n\nVí dụ:\nDear Miss Joseph, I am writing this letter…\n\n1. What is the purpose of the letter?\n(A) …  (B) …  (C) …  (D) …\nAnswer key: 1B'}
            onChange={event => { setText(event.target.value); if (source.kind === 'docx') setSource({ kind: 'paste', fileName: null }); }}
          />
          {!hasContent && <FileDropzone title="Hoặc kéo thả file DOCX" description="Một file .docx, tối đa 10 MB" accept=".docx" onChange={onDocx} />}

          {hasContent && <DetectionPreview detection={detection} detecting={detecting} />}

          {detection?.segments?.length > 0 && <div className="cs-input__save">
            <FormField label="Tên học liệu" required>
              <Input value={title} maxLength={240} onChange={event => { setTitle(event.target.value); setTitleTouched(true); }} />
            </FormField>
            <FormField label="Lưu vào thư mục">
              <Select value={targetFolder} onChange={event => setTargetFolder(event.target.value)}>
                <option value="">Chưa phân loại</option>
                {folderOptions.map(folder => <option key={folder.id} value={folder.id}>{`${'— '.repeat(folder.depth)}${folder.name}`}</option>)}
              </Select>
            </FormField>
            <Button icon={<Save />} loading={saving} disabled={detecting || !title.trim()} onClick={save}>Lưu học liệu</Button>
          </div>}
        </Surface>}
        {!canEdit && <Alert tone="info" title="Chế độ chỉ xem">Bạn cần quyền "Nhập và chỉnh sửa nội dung" để thêm học liệu.</Alert>}

        <Surface className="cs-items" padding="none">
          <div className="cs-items__head"><ListChecks /><strong>{folderLabel}</strong><Badge>{items.length}</Badge></div>
          <DataTable
            ariaLabel={`Học liệu trong ${folderLabel}`}
            columns={columns}
            rows={items}
            loading={itemsLoading}
            error={itemsError}
            errorAction={<Button variant="outline" size="sm" icon={<RotateCcw />} onClick={loadItems}>Thử lại</Button>}
            emptyTitle="Chưa có học liệu"
            emptyDescription={canEdit ? 'Dán nội dung ở trên để tạo học liệu đầu tiên trong thư mục này.' : 'Thư mục này chưa có học liệu.'}
            getRowActions={canEdit ? row => [{ label: 'Xoá', danger: true, onClick: () => setPendingDelete(row) }] : undefined}
            density="compact"
          />
        </Surface>
      </div>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        danger
        loading={deleting}
        title={`Xoá "${pendingDelete?.title || ''}"?`}
        description="Học liệu và nội dung đã nhận diện sẽ bị xoá vĩnh viễn."
        confirmLabel="Xoá học liệu"
        onConfirm={removeItem}
        onClose={() => setPendingDelete(null)}
      />

      <FolderPanel
        folders={folders}
        unfiledCount={unfiledCount}
        selected={selectedFolder}
        onSelect={setSelectedFolder}
        canManage={permissions.manageFolders}
        onChanged={async () => { await loadFolders(); await loadItems(); }}
        showMsg={showMsg}
      />
    </div>
  </PageFrame>;
}
