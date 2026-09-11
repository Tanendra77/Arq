import { useEffect, useRef } from "react";

/**
 * Every field wraps its control in a `<label>` with the caption as visible text, rather than
 * duplicating that text into `aria-label`: the wrapping association alone gives
 * `getByLabelText`/screen readers the accessible name, so there is exactly one place — the
 * visible caption — that names the control.
 */

export function TextField({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="arq-field">
      <span>{label}</span>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/**
 * A blank swatch isn't representable by a native color input (it always resolves to some
 * color), so an indeterminate value falls back to a neutral grey swatch; `data-indeterminate`
 * on the input itself is the authoritative signal consumers (and tests) read.
 */
export function ColorField({
  label, value, indeterminate = false, onChange,
}: { label: string; value: string | undefined; indeterminate?: boolean; onChange: (v: string) => void }) {
  return (
    <label className="arq-field">
      <span>{label}</span>
      <input
        type="color"
        value={value ?? "#808080"}
        data-indeterminate={indeterminate ? "true" : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function NumberField({
  label, value, indeterminate = false, min, step = 1, onChange,
}: {
  label: string; value: number | undefined; indeterminate?: boolean; min?: number; step?: number;
  onChange: (v: number) => void;
}) {
  const blank = indeterminate || value === undefined;
  return (
    <label className="arq-field">
      <span>{label}</span>
      <input
        type="number"
        value={blank ? "" : value}
        min={min}
        step={step}
        data-indeterminate={indeterminate ? "true" : undefined}
        onChange={(e) => {
          const n = e.target.valueAsNumber;
          if (!Number.isNaN(n)) onChange(n);
        }}
      />
    </label>
  );
}

export function SelectField<T extends string>({
  label, value, indeterminate = false, options, onChange,
}: {
  label: string; value: T | undefined; indeterminate?: boolean; options: readonly T[];
  onChange: (v: T) => void;
}) {
  const blank = indeterminate || value === undefined;
  return (
    <label className="arq-field">
      <span>{label}</span>
      <select
        value={blank ? "" : value}
        data-indeterminate={indeterminate ? "true" : undefined}
        // `options` is exhaustive for T, so every value this <select> can produce is a T; this
        // narrows the DOM's plain string back to it rather than widening the type with `any`.
        onChange={(e) => onChange(e.target.value as T)}
      >
        {blank ? <option value="">Mixed</option> : null}
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

export function CheckboxField({
  label, checked, indeterminate = false, onChange,
}: { label: string; checked: boolean; indeterminate?: boolean; onChange: (v: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  // The native "indeterminate" tri-state has no JSX prop; it must be set imperatively on the
  // DOM node, so screen readers and browser chrome render the dash state too.
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <label className="arq-field arq-field-checkbox">
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        data-indeterminate={indeterminate ? "true" : undefined}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
