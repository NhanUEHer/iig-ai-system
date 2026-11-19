import { useEffect, useState } from 'react';
import { listProviders } from '../services/aiCoreApi';

// Provider names, labels and capabilities come from the backend adapter registry,
// so the UI never hardcodes a provider. Cached for the session.
let cache = null;

export default function useProviders() {
  const [providers, setProviders] = useState(cache || []);
  useEffect(() => {
    if (cache) return;
    listProviders().then(items => { cache = items; setProviders(items); }).catch(() => {});
  }, []);
  const find = name => providers.find(item => item.name === name);
  return {
    providers,
    labelOf: name => find(name)?.label || name || '',
    capabilitiesOf: name => find(name)?.capabilities || {},
  };
}
