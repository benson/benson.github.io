import { attrs, esc } from './escape.js?v=8aef8835f3ab';

export function buttonHtml({
  label,
  type = 'button',
  variant = 'primary',
  classes = '',
  attrs: extraAttrs = {},
} = {}) {
  const variantClass =
    variant === 'secondary'
      ? ' btn-secondary'
      : variant === 'danger'
        ? ' btn-danger'
        : variant === 'ink'
          ? ' btn-ink'
          : '';
  const className = `btn${variantClass}${classes ? ` ${classes}` : ''}`;
  return `<button class="${className}" type="${esc(type)}"${attrs(extraAttrs)}>${esc(label || '')}</button>`;
}

export function fieldRowHtml({
  fieldClass = '',
  label,
  controlHtml,
  helperHtml = '',
  labelClass = '',
} = {}) {
  const cls = fieldClass ? ` ${fieldClass}` : '';
  const extraLabelClass = labelClass ? ` ${labelClass}` : '';
  return `<label class="field-row${cls}${extraLabelClass}">${esc(label || '')}${controlHtml || ''}${helperHtml || ''}</label>`;
}
