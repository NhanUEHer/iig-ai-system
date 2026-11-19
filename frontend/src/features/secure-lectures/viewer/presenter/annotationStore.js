const PREFIX = 'sl:annot:v1:';
export const MAX_ANNOTATION_BYTES = 4 * 1024 * 1024;

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

function cleanData(value = {}) {
  return {
    slides: value.slides && typeof value.slides === 'object' ? value.slides : {},
    notes: value.notes && typeof value.notes === 'object' ? value.notes : {},
    updatedAt: value.updatedAt || new Date().toISOString(),
  };
}

function roundedData(value) {
  const data = cleanData(value);
  return {
    ...data,
    slides: Object.fromEntries(Object.entries(data.slides).map(([key, strokes]) => [key,
      (Array.isArray(strokes) ? strokes : []).map(stroke => ({
        ...stroke,
        points: (stroke.points || []).map(point => point.map(number => (
          Number.isFinite(number) ? Math.round(number * 1000) / 1000 : number
        ))),
      })),
    ])),
  };
}

export function serializeAnnotationData(value, limitBytes = MAX_ANNOTATION_BYTES) {
  let serialized = JSON.stringify(cleanData(value));
  if (byteLength(serialized) <= limitBytes) return serialized;
  serialized = JSON.stringify(roundedData(value));
  if (byteLength(serialized) <= limitBytes) return serialized;
  const error = new Error('Annotation storage limit exceeded.');
  error.code = 'ANNOTATION_TOO_LARGE';
  throw error;
}

async function defaultHash(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

export async function annotationStorageKey(token, hashToken = defaultHash) {
  const hash = String(await hashToken(token));
  return `${PREFIX}${hash.slice(0, 16)}`;
}

export async function createAnnotationStore({
  token,
  storage = window.localStorage,
  hashToken = defaultHash,
  onError = () => {},
  delay = 500,
  limitBytes = MAX_ANNOTATION_BYTES,
} = {}) {
  const key = await annotationStorageKey(token, hashToken);
  let timer;
  let pending;

  function load() {
    try {
      const raw = storage.getItem(key);
      return raw ? cleanData(JSON.parse(raw)) : cleanData();
    } catch (error) {
      onError(error);
      return cleanData();
    }
  }

  function flush() {
    if (!pending) return true;
    try {
      storage.setItem(key, serializeAnnotationData(pending, limitBytes));
      pending = undefined;
      return true;
    } catch (error) {
      onError(error);
      return false;
    }
  }

  function schedule(value, wait = delay) {
    pending = { ...value, updatedAt: new Date().toISOString() };
    clearTimeout(timer);
    timer = setTimeout(flush, wait);
  }

  function destroy() {
    clearTimeout(timer);
    flush();
  }

  return { key, load, schedule, flush, destroy };
}
