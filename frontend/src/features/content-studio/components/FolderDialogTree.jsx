import React from 'react';
import { Check, ChevronDown, ChevronRight, Folder } from 'lucide-react';
import { subtreeItemCount } from '../folderTree';

function FolderRow({ node, depth, selectedId, expanded, onToggle, onSelect }) {
  const hasChildren = Boolean(node.children?.length);
  const isExpanded = expanded.has(node.id);
  const selected = selectedId === node.id;
  return <li>
    <button
      type="button"
      className={`cs-folder-tree__row${selected ? ' is-selected' : ''}`}
      style={{ '--cs-tree-depth': depth }}
      onClick={() => onSelect(node.id)}
    >
      <span className="cs-folder-tree__toggle" onClick={event => { event.stopPropagation(); if (hasChildren) onToggle(node.id); }}>
        {hasChildren ? (isExpanded ? <ChevronDown /> : <ChevronRight />) : null}
      </span>
      <Folder className="cs-folder-tree__icon" />
      <span className="cs-folder-tree__name">{node.name}</span>
      <span className="cs-folder-tree__count">{subtreeItemCount(node)}{depth === 0 ? ' bài' : ''}</span>
      {selected && <Check className="cs-folder-tree__check" />}
    </button>
    {hasChildren && isExpanded && <ul>{node.children.map(child => <FolderRow
      key={child.id}
      node={child}
      depth={depth + 1}
      selectedId={selectedId}
      expanded={expanded}
      onToggle={onToggle}
      onSelect={onSelect}
    />)}</ul>}
  </li>;
}

export default function FolderDialogTree({ nodes, selectedId, expanded, onToggle, onSelect, children }) {
  return <ul className="cs-folder-tree">
    {nodes.map(node => <FolderRow
      key={node.id}
      node={node}
      depth={0}
      selectedId={selectedId}
      expanded={expanded}
      onToggle={onToggle}
      onSelect={onSelect}
    />)}
    {children}
  </ul>;
}
