export function detectTemplateVariables(template = '') {
  const names = [...String(template).matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g)]
    .map(match => match[1]);
  return [...new Set(names)];
}

export function validateJsonSchemaText(text = '') {
  try {
    const value = JSON.parse(String(text));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { valid: false, error: 'Schema phải là một JSON object.' };
    }
    return { valid: true, value, error: '' };
  } catch (error) {
    return { valid: false, error: `JSON chưa hợp lệ: ${error.message}` };
  }
}

export function formatCompactNumber(value = 0) {
  const number = Number(value) || 0;
  if (number >= 1_000_000) return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(number / 1_000_000)}M`;
  if (number >= 1_000) return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(number / 1_000)}K`;
  return new Intl.NumberFormat('vi-VN').format(number);
}

export function estimateInputTokens(values = {}) {
  const characters = Object.values(values).reduce((total, value) => total + String(value || '').length, 0);
  return Math.max(0, Math.ceil(characters / 4));
}
