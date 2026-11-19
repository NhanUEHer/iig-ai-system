function entry(strokes = []) {
  return { past: [], present: strokes, future: [] };
}

export function createAnnotationHistory(slides = {}) {
  return {
    slides: Object.fromEntries(Object.entries(slides).map(([key, strokes]) => [key, entry(strokes)])),
  };
}

export function currentStrokes(state, slideKey) {
  return state.slides[slideKey]?.present || [];
}

export function persistedSlides(state) {
  return Object.fromEntries(Object.entries(state.slides)
    .filter(([, value]) => value.present.length)
    .map(([key, value]) => [key, value.present]));
}

function change(state, slideKey, next) {
  const current = state.slides[slideKey] || entry();
  if (next === current.present) return state;
  return {
    ...state,
    slides: {
      ...state.slides,
      [slideKey]: { past: [...current.past, current.present], present: next, future: [] },
    },
  };
}

export function annotationHistoryReducer(state, action) {
  const slideKey = action.slideKey || 'default';
  const current = state.slides[slideKey] || entry();
  if (action.type === 'reset') return createAnnotationHistory(action.slides);
  if (action.type === 'add') return change(state, slideKey, [...current.present, action.stroke]);
  if (action.type === 'remove') {
    const next = current.present.filter(stroke => stroke.id !== action.strokeId);
    return next.length === current.present.length ? state : change(state, slideKey, next);
  }
  if (action.type === 'clear') return current.present.length ? change(state, slideKey, []) : state;
  if (action.type === 'undo' && current.past.length) {
    return {
      ...state,
      slides: { ...state.slides, [slideKey]: {
        past: current.past.slice(0, -1),
        present: current.past.at(-1),
        future: [current.present, ...current.future],
      } },
    };
  }
  if (action.type === 'redo' && current.future.length) {
    return {
      ...state,
      slides: { ...state.slides, [slideKey]: {
        past: [...current.past, current.present],
        present: current.future[0],
        future: current.future.slice(1),
      } },
    };
  }
  return state;
}
