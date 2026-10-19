import React, { useEffect, useMemo, useRef } from 'react';
import Uppy from '@uppy/core';
import Dashboard from '@uppy/react/dashboard';
import XHRUpload from '@uppy/xhr-upload';
import { FileAudio, FileImage, FileVideo, Trash2, RotateCcw } from 'lucide-react';
import { readSession } from '../../services/authSession';
import '@uppy/core/css/style.min.css';
import '@uppy/dashboard/css/style.min.css';
import './media-upload.css';

const typeIcon = { IMAGE: FileImage, AUDIO: FileAudio, VIDEO: FileVideo };

export function UploadDropzone({ endpoint, accept = ['image/*', 'audio/*', 'video/*'], maxFileSize = 20 * 1024 * 1024, multiple = true, onUploaded, onError, note = 'Ảnh, audio hoặc video · tối đa 20MB', height = 76 }) {
  const onUploadedRef = useRef(onUploaded);
  const onErrorRef = useRef(onError);
  useEffect(() => { onUploadedRef.current = onUploaded; }, [onUploaded]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  const acceptKey = accept.join('|');
  const uppy = useMemo(() => { const session = readSession(); return new Uppy({ autoProceed: true, allowMultipleUploadBatches: true, restrictions: { maxFileSize, allowedFileTypes: acceptKey.split('|'), maxNumberOfFiles: multiple ? 10 : 1 } }).use(XHRUpload, { endpoint, fieldName: 'file', headers: session?.token ? { Authorization: `Bearer ${session.token}` } : {} }); }, [endpoint, acceptKey, maxFileSize, multiple]);
  useEffect(() => { const complete = result => result.successful?.forEach(file => onUploadedRef.current?.(file, file.response?.body?.data || file.response?.body)); const failed = (_, error) => { onErrorRef.current?.(error?.message || 'Upload media thất bại.'); }; uppy.on('complete', complete); uppy.on('upload-error', failed); return () => { uppy.off('complete', complete); uppy.off('upload-error', failed); uppy.destroy(); }; }, [uppy]);
  return <div className="ui-upload-dropzone"><Dashboard uppy={uppy} width="100%" height={height} proudlyDisplayPoweredByUppy={false} note={note} showProgressDetails /></div>;
}

export function UploadProgress({ fileName, progress = 0, status = 'uploading', onRetry, onCancel }) {
  return <div className="ui-upload-progress"><div className="ui-upload-progress__info"><strong>{fileName}</strong><span>{status === 'success' ? 'Đã tải lên' : status === 'error' ? 'Tải lên thất bại' : `${progress}%`}</span></div><div className="ui-upload-progress__bar"><span style={{ width: `${progress}%` }} /></div><div className="ui-upload-progress__actions">{status === 'error' && <button type="button" onClick={onRetry}><RotateCcw /> Thử lại</button>}{status === 'uploading' && <button type="button" onClick={onCancel}>Hủy</button>}</div></div>;
}

export function MediaPreview({ media, onDelete, onRetry }) {
  const type = String(media?.mediaType || media?.type || media?.mimeType || '').toUpperCase(); const normalizedType = type.startsWith('IMAGE') ? 'IMAGE' : type.startsWith('VIDEO') ? 'VIDEO' : type.startsWith('AUDIO') ? 'AUDIO' : type; const Icon = typeIcon[normalizedType] || FileImage; const url = media?.url || media?.signedUrl || media?.fileUrl || media?.publicUrl || media?.location || (media?.file instanceof File ? URL.createObjectURL(media.file) : ''); const status = media?.status || 'success';
  return <article className={`ui-media-card ui-media-card--${status}`}><div className="ui-media-card__preview">{normalizedType === 'IMAGE' && url ? <img src={url} alt={media.originalName || 'Media'} loading="lazy" /> : normalizedType === 'VIDEO' && url ? <video src={url} controls preload="metadata" playsInline /> : normalizedType === 'AUDIO' && url ? <audio src={url} controls preload="metadata" /> : <Icon aria-hidden="true" />}</div><div className="ui-media-card__meta"><strong title={media.originalName}>{media.originalName || 'Tệp media'}</strong>{status === 'error' ? <button type="button" onClick={() => onRetry?.(media)}><RotateCcw /> Thử lại</button> : onDelete && <button type="button" className="is-danger" onClick={() => onDelete(media)} aria-label="Xóa media"><Trash2 /></button>}</div></article>;
}

export function MediaGallery({ items = [], onDelete, onRetry }) { return <div className="ui-media-gallery">{items.length ? items.map(item => <MediaPreview key={item.id || item.key || item.originalName} media={item} onDelete={onDelete} onRetry={onRetry} />) : <div className="ui-media-gallery__empty">Chưa có media đã lưu.</div>}</div>; }
