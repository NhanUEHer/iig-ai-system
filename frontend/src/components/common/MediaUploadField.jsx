import React from 'react';
import { UploadCloud, X } from 'lucide-react';
import './MediaUploadField.css';

export default function MediaUploadField({ label, accept, file, onChange }) {
  return <label className="media-upload-field">
    <span>{label}</span>
    <input type="file" accept={accept} onChange={event => onChange?.(event.target.files?.[0] || null)} />
    <span className="media-upload-control"><UploadCloud /><strong>{file?.name || 'Chọn tệp'}</strong>{file && <button type="button" onClick={event => { event.preventDefault(); onChange?.(null); }} aria-label="Xóa tệp"><X /></button>}</span>
  </label>;
}
