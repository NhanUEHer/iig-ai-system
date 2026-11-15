// Maps changed paths to IIG Admin components so CI/CD only tests, builds and deploys what changed.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const COMPONENTS = {
  'admin-api': { file: 'Dockerfile', target: 'admin-api', image: 'iig-admin-api' },
  'admin-web': { file: 'frontend/Dockerfile', image: 'iig-admin-admin-web' },
  'exam-web': { file: 'exam-web/Dockerfile', image: 'iig-admin-exam-web' },
};
const ALL_COMPONENTS = Object.keys(COMPONENTS);

// [pattern, components whose IMAGE is affected]
const IMAGE_RULES = [
  [/^src\//, ['admin-api']],
  [/^scripts\/(?!ci\/|deploy-containers\.sh$|configure-beta-environment\.sh$)/, ['admin-api']],
  [/^(Dockerfile|\.dockerignore)$/, ['admin-api']],
  [/^package(-lock)?\.json$/, ['admin-api', 'admin-web']], // frontend image copies the root package.json
  [/^deploy\/docker\/(api-entrypoint\.sh)$/, ['admin-api']],
  [/^frontend\//, ['admin-web']],
  [/^deploy\/docker\/(admin\.nginx\.conf|40-runtime-config\.sh)$/, ['admin-web']],
  [/^exam-web\//, ['exam-web']],
  [/^deploy\/docker\/exam\.nginx\.conf$/, ['exam-web']],
  [/^deploy\/docker\/proxy_params$/, ['admin-web', 'exam-web']],
];
const DOCKERFILE_INPUTS = /^(Dockerfile|\.dockerignore|package(-lock)?\.json|frontend\/(Dockerfile|package(-lock)?\.json)|exam-web\/(Dockerfile|package(-lock)?\.json)|deploy\/docker\/)/;
const DEPLOY_DEFS = /^(deploy\/(docker-compose|nginx)|scripts\/(deploy-containers|configure-beta-environment)\.sh$|deploy\/docker\/deploy-ssh-gateway\.sh$)/;
const CI = /^(\.github\/|scripts\/ci\/)/;
const TESTS_BACKEND = /^(src\/|scripts\/|tests\/|contracts\/|package(-lock)?\.json$|deploy\/|\.github\/)/;

export function componentsForFiles(files) {
  const selected = new Set();
  for (const file of files) {
    for (const [pattern, components] of IMAGE_RULES) {
      if (pattern.test(file)) components.forEach(component => selected.add(component));
    }
  }
  return ALL_COMPONENTS.filter(component => selected.has(component));
}

export function flagsForFiles(files) {
  const components = componentsForFiles(files);
  return {
    components,
    backend: files.some(file => TESTS_BACKEND.test(file)),
    admin_web: components.includes('admin-web'),
    exam_web: components.includes('exam-web'),
    image_inputs: files.some(file => DOCKERFILE_INPUTS.test(file)),
    deploy_defs: files.some(file => DEPLOY_DEFS.test(file)),
    ci: files.some(file => CI.test(file)),
  };
}

export function matrixForComponents(components) {
  return { include: components.map(name => ({ name, ...COMPONENTS[name] })) };
}

function changedFiles(base, head) {
  if (!base || /^0+$/.test(base)) return null;
  try {
    return execFileSync('git', ['diff', '--name-only', `${base}...${head}`], { encoding: 'utf8' })
      .split('\n').map(value => value.trim()).filter(Boolean);
  } catch {
    return null;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [base, head = 'HEAD'] = process.argv.slice(2);
  const files = changedFiles(base, head);
  const flags = files ? flagsForFiles(files) : {
    components: ALL_COMPONENTS, backend: true, admin_web: true, exam_web: true, image_inputs: true, deploy_defs: true, ci: true,
  };
  process.stdout.write(`matrix=${JSON.stringify(matrixForComponents(flags.components))}\n`);
  process.stdout.write(`components=${flags.components.join(',')}\n`);
  process.stdout.write(`has_changes=${flags.components.length > 0}\n`);
  for (const key of ['backend', 'admin_web', 'exam_web', 'image_inputs', 'deploy_defs', 'ci']) {
    process.stdout.write(`${key}=${flags[key]}\n`);
  }
}
