export const ALL_FOLDERS = 'all';
export const UNFILED = 'unfiled';

export function buildTree(folders, parentId = null) {
  return folders.filter(folder => (folder.parentId || null) === parentId).map(folder => {
    const children = buildTree(folders, folder.id);
    return { ...folder, children };
  });
}

export function flattenFolders(folders) {
  const walk = (nodes, depth) => nodes.flatMap(node => [{ id: node.id, name: node.name, depth }, ...walk(node.children, depth + 1)]);
  return walk(buildTree(folders), 0);
}

export function buildFolderPath(folders, id) {
  const byId = new Map(folders.map(folder => [folder.id, folder]));
  const path = [];
  for (let current = byId.get(id); current && path.length < 20; current = byId.get(current.parentId)) path.unshift(current);
  return path;
}

export function folderPathLabel(folders, id, fallback = 'Chưa phân loại') {
  const path = buildFolderPath(folders, id);
  return path.length ? path.map(folder => folder.name).join(' › ') : fallback;
}

export function subtreeItemCount(node) {
  return Number(node.itemCount || 0) + (node.children || []).reduce((total, child) => total + subtreeItemCount(child), 0);
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
