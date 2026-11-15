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
