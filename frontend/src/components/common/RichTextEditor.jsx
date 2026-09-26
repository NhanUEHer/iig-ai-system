import React, { useRef, useEffect, useContext } from 'react';
import {
  Bold, Italic, Underline, Strikethrough, Heading1, Heading2,
  List, ListOrdered, Link as LinkIcon, RemoveFormatting, Code
} from 'lucide-react';
import { DialogContext } from '../feedback/dialogContext';
import './RichTextEditor.css';

// Basic XSS sanitizer to allow only safe formatting tags and attributes
export function sanitizeHtml(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const allowedTags = new Set([
    'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'CODE',
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'P', 'DIV', 'BR', 'UL', 'OL', 'LI', 'A', 'SPAN', 'BLOCKQUOTE'
  ]);

  function cleanNode(node) {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        if (!allowedTags.has(child.nodeName)) {
          // Replace unallowed element with its text content
          const textNode = doc.createTextNode(child.textContent || '');
          node.replaceChild(textNode, child);
        } else {
          // Filter attributes, allowing href and target for <a> tags
          const attrs = Array.from(child.attributes);
          for (const attr of attrs) {
            const attrName = attr.name.toLowerCase();
            if (child.nodeName === 'A' && (attrName === 'href' || attrName === 'target' || attrName === 'rel')) {
              if (attrName === 'href' && attr.value.trim().toLowerCase().startsWith('javascript:')) {
                child.removeAttribute(attr.name);
              }
            } else {
              child.removeAttribute(attr.name);
            }
          }
          if (child.nodeName === 'A') {
            child.setAttribute('target', '_blank');
            child.setAttribute('rel', 'noopener noreferrer');
          }
          cleanNode(child);
        }
      }
    }
  }

  cleanNode(doc.body);
  return doc.body.innerHTML;
}

export default function RichTextEditor({
  value = '',
  onChange,
  placeholder = 'Nhập nội dung...',
  error = false,
  minHeight = '104px',
  variant = 'stitch',
  questionTools = false
}) {
  const editorRef = useRef(null);

  // Hydrate initial HTML content cleanly without losing cursor when user types
  useEffect(() => {
    if (editorRef.current) {
      const currentHtml = editorRef.current.innerHTML;
      if (value !== currentHtml) {
        // If current DOM is empty or value differs significantly from current HTML text content
        if (!currentHtml || currentHtml === '<br>' || value === '' || editorRef.current.innerText.trim() !== new DOMParser().parseFromString(value, 'text/html').body.innerText.trim()) {
          editorRef.current.innerHTML = value || '';
        }
      }
    }
  }, [value]);

  const handleInput = () => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      // If editor contains only <br>, normalize to empty string
      const clean = (html === '<br>' || html === '<div><br></div>') ? '' : html;
      onChange?.(clean);
    }
  };

  const keepSelection = event => {
    event.preventDefault();
  };

  const execCommand = (command, val = null) => {
    document.execCommand(command, false, val);
    if (editorRef.current) {
      editorRef.current.focus();
      handleInput();
    }
  };

  const dialog = useContext(DialogContext);

  const handleAddLink = async () => {
    let url = null;
    const dialogPrompt = dialog?.prompt;
    if (typeof dialogPrompt === 'function') {
      url = await dialogPrompt({
        title: 'Thêm liên kết',
        label: 'URL liên kết',
        placeholder: 'https://...',
      });
    }
    if (url) {
      execCommand('createLink', url);
    }
  };

  return (
    <div className={`rich-editor-wrapper rich-editor-wrapper--${variant} ${error ? 'error' : ''}`}>
      <div className="rich-editor-toolbar" role="toolbar" aria-label="Định dạng nội dung HTML" onMouseDown={keepSelection}>
        <button
          type="button"
          className="rich-btn"
          title="In đậm (Bold)"
          onClick={() => execCommand('bold')}
        >
          {variant === 'stitch' ? 'B' : <Bold />}
        </button>
        <button
          type="button"
          className="rich-btn"
          title="In nghiêng (Italic)"
          onClick={() => execCommand('italic')}
        >
          {variant === 'stitch' ? 'I' : <Italic />}
        </button>
        <button
          type="button"
          className="rich-btn"
          title="Gạch chân (Underline)"
          onClick={() => execCommand('underline')}
        >
          {variant === 'stitch' ? 'U' : <Underline />}
        </button>
        <button
          type="button"
          className="rich-btn"
          title="Gạch ngang (Strikethrough)"
          onClick={() => execCommand('strikeThrough')}
        >
          {variant === 'stitch' ? 'S' : <Strikethrough />}
        </button>

        <span className="rich-toolbar-divider" />

        <button
          type="button"
          className="rich-btn"
          title="Tiêu đề lớn (Heading 1)"
          onClick={() => execCommand('formatBlock', '<h1>')}
        >
          {variant === 'stitch' ? 'H1' : <Heading1 />}
        </button>
        <button
          type="button"
          className="rich-btn"
          title="Tiêu đề vừa (Heading 2)"
          onClick={() => execCommand('formatBlock', '<h2>')}
        >
          {variant === 'stitch' ? 'H2' : <Heading2 />}
        </button>

        <span className="rich-toolbar-divider" />

        <button
          type="button"
          className="rich-btn"
          title="Danh sách dấu chấm (Bullet List)"
          onClick={() => execCommand('insertUnorderedList')}
        >
          <List />
        </button>
        <button
          type="button"
          className="rich-btn"
          title="Danh sách số (Numbered List)"
          onClick={() => execCommand('insertOrderedList')}
        >
          <ListOrdered />
        </button>

        <span className="rich-toolbar-divider" />

        <button
          type="button"
          className="rich-btn"
          title="Thêm liên kết (Link)"
          onClick={handleAddLink}
        >
          <LinkIcon />
        </button>
        {questionTools && <>
          <button type="button" className="rich-btn rich-btn--text" title="Chèn công thức" onClick={() => execCommand('insertText', 'fx')}>fx</button>
          <button type="button" className="rich-btn rich-btn--blank" title="Chèn ô trống" onClick={() => execCommand('insertText', '[blank]')}>[blank]</button>
        </>}
        <button
          type="button"
          className="rich-btn"
          title="Mã nguồn (Code block)"
          onClick={() => execCommand('formatBlock', '<pre>')}
        >
          <Code />
        </button>
        <button
          type="button"
          className="rich-btn"
          title="Xóa định dạng"
          onClick={() => execCommand('removeFormat')}
        >
          <RemoveFormatting />
        </button>
      </div>

      <div
        ref={editorRef}
        className="rich-editor-content"
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        onInput={handleInput}
        onBlur={handleInput}
        style={{ minHeight }}
        data-placeholder={placeholder}
        suppressContentEditableWarning
      />
    </div>
  );
}
