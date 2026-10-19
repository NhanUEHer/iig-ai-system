import React from 'react';
import { FormField, Input } from '../../../components/ui/FormField';
import CreatableMultiCombobox from '../../../components/ui/CreatableMultiCombobox';
import MultiSelectFilter from '../../../components/ui/MultiSelectFilter';
import MediaUploader from '../../../components/common/MediaUploader';
import { DIFFICULTY_OPTIONS } from '../examCatalog';
import './ExamCatalogFields.css';

export default function ExamCatalogFields({ value, onChange, groupOptions, onCreateGroup, imageItem, onPickImage, onRemoveImage, disabled = false, errors = {} }) {
  const update = (key, next) => onChange(current => ({ ...current, [key]: next }));
  return <section className="exam-catalog-fields">
    <div className="exam-catalog-fields__grid">
      <FormField label="Nhóm đề thi" required error={errors.groupIds}>
        <CreatableMultiCombobox options={groupOptions} value={value.groupIds || []} onChange={next => update('groupIds', next)} placeholder="Chọn hoặc tạo nhóm đề thi" searchPlaceholder="Tìm nhóm đề thi..." createLabel="Thêm nhóm" onCreate={onCreateGroup} disabled={disabled} />
      </FormField>
      <FormField label="Độ khó" required error={errors.difficulty}>
        <MultiSelectFilter single className="exam-catalog-fields__single" value={value.difficulty || ''} onApply={next => update('difficulty', next)} options={DIFFICULTY_OPTIONS} placeholder="Chọn độ khó" disabled={disabled} />
      </FormField>
    </div>
    <FormField label="Nhãn đề thi">
      <Input value={value.displayLabel || ''} maxLength={80} disabled={disabled} onChange={event => update('displayLabel', event.target.value)} placeholder="Nhập nhãn đề thi" />
    </FormField>
    <FormField label="Ảnh đại diện đề thi">
      <MediaUploader variant="content" items={imageItem ? [imageItem] : []} accept={['image/jpeg','image/png','image/webp']} maxFileSize={5*1024*1024} multiple={false} height={96} note="" disabled={disabled} onFilesSelected={files => onPickImage?.(files[0])} onDelete={onRemoveImage} />
    </FormField>
  </section>;
}
