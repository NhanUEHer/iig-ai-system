export const ALL_FOLDERS = 'all';
export const UNFILED = 'unfiled';

export function buildTree(folders, parentId = null) {
  return folders
    .filter(folder => (folder.parentId || null) === parentId)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || a.name.localeCompare(b.name, 'vi'))
    .map(folder => ({ ...folder, children: buildTree(folders, folder.id) }));
}

export function flattenFolders(folders) {
  const walk = (nodes, depth) => nodes.flatMap(node => [
    { id: node.id, name: node.name, depth },
    ...walk(node.children || [], depth + 1),
  ]);
  return walk(buildTree(folders), 0);
}

export function buildFolderPath(folders, id) {
  const byId = new Map(folders.map(folder => [folder.id, folder]));
  const path = [];
  const visited = new Set();
  for (let current = byId.get(id); current && !visited.has(current.id); current = byId.get(current.parentId)) {
    visited.add(current.id);
    path.unshift(current);
  }
  return path;
}

export function folderPathLabel(folders, id, fallback = 'Chưa phân loại') {
  const path = buildFolderPath(folders, id);
  return path.length ? path.map(folder => folder.name).join(' › ') : fallback;
}

export function subtreeItemCount(node, countKey = 'itemCount') {
  const ownCount = Number(node[countKey] ?? node.lectureCount ?? 0);
  return ownCount + (node.children || []).reduce((total, child) => total + subtreeItemCount(child, countKey), 0);
}

export function filterFolderTree(nodes, query) {
  const normalized = String(query || '').trim().toLocaleLowerCase('vi');
  if (!normalized) return nodes;
  return nodes.flatMap(node => {
    const children = filterFolderTree(node.children || [], normalized);
    return node.name.toLocaleLowerCase('vi').includes(normalized) || children.length
      ? [{ ...node, children }]
      : [];
  });
}

export function descendantIds(folders, id) {
  const children = new Map();
  folders.forEach(folder => {
    const parentId = folder.parentId || null;
    children.set(parentId, [...(children.get(parentId) || []), folder.id]);
  });
  const result = new Set();
  const visit = current => (children.get(current) || []).forEach(childId => {
    if (result.has(childId)) return;
    result.add(childId);
    visit(childId);
  });
  visit(id);
  return result;
}
