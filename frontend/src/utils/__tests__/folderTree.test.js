import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFolderPath, buildTree, descendantIds, filterFolderTree, subtreeItemCount } from '../folderTree.js';

const folders = [
  { id: 'root', parentId: null, name: 'Khoá học', sortOrder: 2, lectureCount: 1 },
  { id: 'unit', parentId: 'root', name: 'Unit 1', sortOrder: 0, lectureCount: 2 },
  { id: 'other', parentId: null, name: 'Demo', sortOrder: 1, lectureCount: 3 },
];

test('buildTree sorts siblings and subtreeItemCount includes descendants', () => {
  const tree = buildTree(folders);
  assert.deepEqual(tree.map(node => node.id), ['other', 'root']);
  assert.equal(subtreeItemCount(tree[1]), 3);
});

test('path, search and descendants work for nested folders', () => {
  assert.deepEqual(buildFolderPath(folders, 'unit').map(node => node.name), ['Khoá học', 'Unit 1']);
  assert.deepEqual(filterFolderTree(buildTree(folders), 'unit').map(node => node.id), ['root']);
  assert.deepEqual([...descendantIds(folders, 'root')], ['unit']);
});
