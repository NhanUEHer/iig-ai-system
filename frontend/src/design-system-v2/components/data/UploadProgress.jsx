import React from 'react';
import { File, RotateCcw, X } from 'lucide-react';
import { IconButton } from '../primitives/Primitives';
import '../components.css';

export function UploadProgress({ files = [], onRetry, onRemove }) {
  return <div className="iig3-upload-list" aria-label="File uploads">{files.map(file => <article className="iig3-upload-item" key={file.id}><File aria-hidden="true" /><div><header><strong>{file.name}</strong><small>{file.status === 'error' ? 'Upload failed' : `${file.progress || 0}%`}</small></header><progress aria-label={`Upload progress for ${file.name}`} max="100" value={file.progress || 0} /></div>{file.status === 'error' && <IconButton size="sm" label={`Retry ${file.name}`} onClick={() => onRetry?.(file)}><RotateCcw /></IconButton>}<IconButton size="sm" label={`Remove ${file.name}`} onClick={() => onRemove?.(file)}><X /></IconButton></article>)}</div>;
}
