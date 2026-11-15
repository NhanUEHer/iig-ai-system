import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileText, RotateCcw, Save, Sparkles, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Badge, Button, FormField, Input, PageFrame, PageHeader, Select, Surface, Textarea,
} from '../../../design-system-v2';
import { createItem, detectDocx, detectText, errorMessage, generateItem, listFolders, listItems } from '../../../services/contentStudioService';
import FolderPanel from '../components/FolderPanel';
import { ALL_FOLDERS, UNFILED, buildFolderPath, flattenFolders } from '../folderTree';
import DetectionPreview from '../components/DetectionPreview';
import ItemList from '../components/ItemList';
import TaskPanel, { DEFAULT_TASKS } from '../components/TaskPanel';
import './ContentStudioPage.css';


export default function ContentStudioPage({ showMsg, permissions = {} }) {
  const [folders, setFolders] = useState([]);
  const [unfiledCount, setUnfiledCount] = useState(0);
  const [selectedFolder, setSelectedFolder] = useState(ALL_FOLDERS);

  const [text, setText] = useState('');
  const [source, setSource] = useState({ kind: 'paste', fileName: null });
  const [detection, setDetection] = useState(null);
  const [detecting, setDetecting] = useState(false);
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [targetFolder, setTargetFolder] = useState('');
  const [saving, setSaving] = useState(false);
  const [tasks, setTasks] = useState(DEFAULT_TASKS);
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [lastSavedId, setLastSavedId] = useState(null);
  const detectSeq = useRef(0);
  const fileInput = useRef(null);
  const showMsgRef = useRef(showMsg);
  useEffect(() => { showMsgRef.current = showMsg; }, [showMsg]);

  const loadFolders = useCallback(async () => {
    try {
      const result = await listFolders();
      setFolders(result.folders); setUnfiledCount(result.unfiledCount);
    } catch (error) { showMsgRef.current?.(errorMessage(error, 'Không thể tải thư mục.'), 'error'); }
  }, []);
  useEffect(() => { loadFolders(); }, [loadFolders]);
  const loadItems = useCallback(async () => {
    setItemsLoading(true);
    try { setItems(await listItems(selectedFolder === ALL_FOLDERS ? {} : { folderId: selectedFolder })); }
    catch (error) { showMsgRef.current?.(errorMessage(error, 'Không thể tải danh sách học liệu.'), 'error'); }
    finally { setItemsLoading(false); }
  }, [selectedFolder]);
  useEffect(() => { loadItems(); }, [loadItems]);
  const anyGenerating = items.some(item => item.status === 'generating');
  useEffect(() => {
    if (!anyGenerating) return undefined;
    const timer = setInterval(loadItems, 3000);
    return () => clearInterval(timer);
  }, [anyGenerating, loadItems]);
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

  const navigate = useNavigate();
  const save = async ({ andGenerate = false } = {}) => {
    if (!detection?.segments?.length || saving) return;
    setSaving(true);
    try {
      const saved = await createItem({
        title: title.trim() || detection.title, folderId: targetFolder || null, sourceText: text,
        sourceKind: source.kind, sourceFileName: source.fileName, segments: detection.segments, tasks,
      });
      if (andGenerate) {
        await generateItem(saved.id);
        showMsg?.('Đã lưu, đang tạo nội dung.', 'success');
        navigate(`/content-studio/items/${saved.id}`);
        return;
      }
      showMsg?.('Đã lưu học liệu.', 'success');
      reset();
      setLastSavedId(saved.id);
      const savedFolder = targetFolder || UNFILED;
      // Show the folder the item was saved into so the new card is visible right away.
      if (selectedFolder !== ALL_FOLDERS && selectedFolder !== savedFolder) setSelectedFolder(savedFolder);
      else await loadItems();
      await loadFolders();
    } catch (error) { showMsg?.(errorMessage(error, 'Không thể lưu học liệu.'), 'error'); }
    finally { setSaving(false); }
  };


  const folderOptions = useMemo(() => flattenFolders(folders), [folders]);
  const folderPath = useMemo(() => buildFolderPath(folders, selectedFolder), [folders, selectedFolder]);
  const folderLabel = selectedFolder === ALL_FOLDERS ? 'Tất cả học liệu' : selectedFolder === UNFILED ? 'Chưa phân loại' : folderPath.at(-1)?.name || 'Thư mục';


  const canEdit = permissions.edit;
  const hasContent = Boolean(text.trim());

  return <div className="iig3-list-screen cs-screen"><PageFrame
    className="cs-page"
    breadcrumb={[{ label: 'Content Studio' }, ...(folderPath.length ? folderPath.map(folder => ({ label: folder.name })) : [{ label: folderLabel }])]}
    header={<PageHeader title="Content Studio" />}
  >
    <div className="cs-layout">
      <div className="cs-main">
        {canEdit && <Surface className="cs-input" padding="lg">
          <div className="cs-input__head">
            <strong>Nhập nội dung</strong>
            {source.kind === 'docx' && <Badge tone="info" icon={<FileText />}>{source.fileName}</Badge>}
            {hasContent && <Button variant="ghost" size="sm" icon={<RotateCcw />} onClick={reset}>Làm lại</Button>}
            <input ref={fileInput} type="file" accept=".docx" hidden onChange={onDocx} />
            <Button variant="outline" size="sm" icon={<Upload />} loading={detecting && source.kind !== 'paste'} onClick={() => fileInput.current?.click()}>Tải file DOCX</Button>
          </div>
          <Textarea
            aria-label="Nội dung đoạn văn và câu hỏi"
            rows={hasContent ? 8 : 16}
            className={hasContent ? 'is-filled' : ''}
            value={text}
            placeholder={'Dán đoạn văn, câu hỏi và đáp án vào đây…\n\nVí dụ:\nDear Miss Joseph, I am writing this letter…\n\n1. What is the purpose of the letter?\n(A) …  (B) …  (C) …  (D) …\nAnswer key: 1B'}
            onChange={event => { setText(event.target.value); if (source.kind === 'docx') setSource({ kind: 'paste', fileName: null }); }}
          />

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
            <Button variant="outline" icon={<Save />} loading={saving} disabled={detecting || !title.trim()} onClick={() => save()}>Lưu</Button>
            {permissions.generate && <Button icon={<Sparkles />} loading={saving} disabled={detecting || !title.trim() || !(tasks.passage.length || tasks.question.length)} onClick={() => save({ andGenerate: true })}>Lưu & tạo nội dung</Button>}
          </div>}
        </Surface>}
        {!canEdit && <Alert tone="info" title="Chế độ chỉ xem">Bạn cần quyền "Nhập và chỉnh sửa nội dung" để thêm học liệu.</Alert>}

        <ItemList title={selectedFolder === ALL_FOLDERS ? 'Tất cả học liệu' : `Trong ${folderLabel}`} items={items} loading={itemsLoading} highlightId={lastSavedId} />
      </div>

      <aside className="cs-side"><FolderPanel
        folders={folders}
        unfiledCount={unfiledCount}
        selected={selectedFolder}
        onSelect={setSelectedFolder}
        canManage={permissions.manageFolders}
        onChanged={async () => { await loadFolders(); await loadItems(); }}
        showMsg={showMsg}
      />
      {canEdit && <TaskPanel
        value={tasks}
        onChange={setTasks}
        detected={Boolean(detection?.segments?.length)}
        hasPassage={Boolean(detection?.summary?.passageCount)}
        hasQuestions={Boolean(detection?.summary?.questionCount)}
      />}</aside>
    </div>
  </PageFrame></div>;
}
