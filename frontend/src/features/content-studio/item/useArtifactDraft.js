import { useEffect, useRef, useState } from 'react';
import { errorMessage, regenerateArtifact, saveArtifact } from '../../../services/contentStudioService';

// Local editable copy of an artifact's content; resets whenever the server version changes.
export default function useArtifactDraft(artifact, { onChanged, showMsg }) {
  const [draft, setDraft] = useState(artifact?.content || null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const version = `${artifact?.id}:${artifact?.updatedAt}`;
  const contentRef = useRef(artifact?.content);
  contentRef.current = artifact?.content;

  // Reset the draft only when the server copy changes (polling returns the same version while idle).
  useEffect(() => { setDraft(contentRef.current || null); setDirty(false); }, [version]);

  const update = next => { setDraft(next); setDirty(true); };
  const save = async () => {
    setSaving(true);
    try {
      const result = await saveArtifact(artifact.id, draft);
      showMsg?.(result.status === 'ready' ? 'Đã lưu.' : 'Đã lưu — còn điểm cần xem lại.', result.status === 'ready' ? 'success' : 'warning');
      setDirty(false);
      await onChanged?.();
    } catch (error) { showMsg?.(errorMessage(error, 'Không thể lưu.'), 'error'); }
    finally { setSaving(false); }
  };
  const regenerate = async () => {
    try { await regenerateArtifact(artifact.id); await onChanged?.(); }
    catch (error) { showMsg?.(errorMessage(error, 'Không thể tạo lại.'), 'error'); }
  };
  return { draft, update, dirty, saving, save, regenerate };
}
