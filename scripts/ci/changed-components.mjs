import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const COMPONENTS = {
  'admin-api': { file: 'Dockerfile', target: 'admin-api' },
  'scoring-api': { file: 'Dockerfile', target: 'ai-scoring-api' },
  'scoring-worker': { file: 'Dockerfile', target: 'ai-scoring-worker' },
  'admin-web': { file: 'frontend/Dockerfile' },
  'exam-web': { file: 'exam-web/Dockerfile' },
};

const ALL_COMPONENTS = Object.keys(COMPONENTS);

export function componentsForFiles(files) {
  const selected = new Set();
  for (const file of files) {
    if (/^(\.github\/workflows\/|Dockerfile$|\.dockerignore$|package(-lock)?\.json$|deploy\/|scripts\/deploy)/.test(file)) {
      ALL_COMPONENTS.forEach(component => selected.add(component));
    } else if (file.startsWith('frontend/')) {
      selected.add('admin-web');
    } else if (file.startsWith('exam-web/')) {
      selected.add('exam-web');
    } else if (file.startsWith('src/') || file.startsWith('scripts/')) {
      selected.add('admin-api');
      selected.add('scoring-api');
      selected.add('scoring-worker');
    }
  }
  return ALL_COMPONENTS.filter(component => selected.has(component));
}

export function matrixForComponents(components) {
  return { include: components.map(name => ({ name, ...COMPONENTS[name] })) };
}

function changedFiles(base, head) {
  try {
    return execFileSync('git', ['diff', '--name-only', `${base}...${head}`], { encoding: 'utf8' })
      .split('\n').map(value => value.trim()).filter(Boolean);
  } catch {
    return ['.github/workflows/ci.yml'];
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [base, head = 'HEAD'] = process.argv.slice(2);
  const components = base ? componentsForFiles(changedFiles(base, head)) : ALL_COMPONENTS;
  process.stdout.write(`matrix=${JSON.stringify(matrixForComponents(components))}\n`);
  process.stdout.write(`has_changes=${components.length > 0}\n`);
}
