import React from 'react';
import { Eye, Pencil, Trash2 } from 'lucide-react';
import Button from './Button';
import './ui.css';

export default function RowActions({ onView, onEdit, onDelete }) {
  return <div className="ui-row-actions">{onView && <Button variant="secondary" iconOnly size="sm" onClick={onView} title="Xem chi tiết" aria-label="Xem chi tiết"><Eye /></Button>}{onEdit && <Button variant="secondary" iconOnly size="sm" onClick={onEdit} title="Chỉnh sửa" aria-label="Chỉnh sửa"><Pencil /></Button>}{onDelete && <Button variant="danger" iconOnly size="sm" onClick={onDelete} title="Xóa" aria-label="Xóa"><Trash2 /></Button>}</div>;
}
