/**
 * VariablesStep — declare your variables instead of pasting a table.
 *
 * The mobile entry path. Pasting a spreadsheet on a phone is
 * miserable, but someone who knows their design ("reaction time by
 * three caffeine doses") can describe it in a few taps. What they
 * declare is synthesised into a representative table and handed to the
 * same recommender the paste path uses.
 *
 * Terminology: plain language leads, the technical term follows in
 * parentheses. Postr's users span psychology, biomedicine, ecology and
 * the humanities; "dependent variable" is native vocabulary in the
 * first two and jargon in the others, while "what you measured" is
 * clear to everyone and still lets a psych user recognise their own
 * term. Leading with the plain phrase and keeping DV/IV visible serves
 * both without a glossary.
 *
 * Every control is a real <button> or <select> at the 44px target
 * floor, and the one text field sits at 16px — below that iOS Safari
 * zooms the viewport on focus and throws the user out of the ladder.
 */
import { useState, type CSSProperties } from 'react';
import {
  MAX_DECLARED_VARIABLES,
  hasUsableOutcome,
  type DeclaredVariable,
  type LevelBand,
  type VariableRoleChoice,
  type VariableTypeChoice,
} from '../declaredVariables';

interface VariablesStepProps {
  onDeclare: (variables: readonly DeclaredVariable[], summary: string) => void;
  /** Back to the paste/upload affordances. */
  onCancel: () => void;
}

const ROLE_OPTIONS: Array<{ value: VariableRoleChoice; label: string; hint: string }> = [
  { value: 'outcome', label: 'Measured', hint: 'dependent' },
  { value: 'factor', label: 'Compared', hint: 'independent' },
];

const TYPE_OPTIONS: Array<{ value: VariableTypeChoice; label: string }> = [
  { value: 'continuous', label: 'Number' },
  { value: 'categorical', label: 'Groups' },
  { value: 'ordered', label: 'Time / order' },
];

const LEVEL_OPTIONS: Array<{ value: LevelBand; label: string }> = [
  { value: 'two', label: '2' },
  { value: 'few', label: '3–5' },
  { value: 'many', label: '6+' },
];

/** WCAG 2.5.5 / Apple HIG target floor, in CSS px. */
const TARGET = 44;

const fieldStyle: CSSProperties = {
  width: '100%',
  border: '1px solid #2a2a3a',
  borderRadius: 8,
  background: '#101018',
  color: '#c8cad0',
  // 16px floor: iOS Safari zooms the page when a focused input is
  // smaller, which is disorienting mid-ladder on the one path that
  // exists specifically for phones.
  fontSize: 16,
  minHeight: TARGET,
  padding: '0 12px',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const buttonStyle: CSSProperties = {
  border: '1px solid #2a2a3a',
  background: '#14141f',
  color: '#c8cad0',
  borderRadius: 8,
  padding: '0 14px',
  minHeight: TARGET,
  display: 'inline-flex',
  alignItems: 'center',
  fontSize: 14,
  cursor: 'pointer',
};

const labelStyle: CSSProperties = {
  fontSize: 12,
  color: '#8a8a95',
  display: 'block',
  marginBottom: 6,
};

/**
 * Small segmented control. A row of real buttons rather than a
 * <select>, because these are 2–3 short options that should be one tap
 * on a phone, not a picker sheet.
 */
function Segmented<T extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: Array<{ value: T; label: string; hint?: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={legend}>
      <span style={labelStyle}>{legend}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map((option) => {
          const on = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(option.value)}
              style={{
                ...buttonStyle,
                flex: '1 1 auto',
                justifyContent: 'center',
                padding: '0 10px',
                border: `1px solid ${on ? '#7c6aed' : '#2a2a3a'}`,
                background: on ? 'rgba(124, 106, 237, 0.16)' : '#14141f',
                color: on ? '#d6cfff' : '#c8cad0',
              }}
            >
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span>{option.label}</span>
                {option.hint && (
                  <span style={{ fontSize: 12, color: on ? '#a99cf5' : '#6b6b76' }}>
                    {option.hint}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

let nextId = 0;
const makeId = () => `var-${(nextId += 1)}`;

/** A new row defaults to the commonest next declaration. */
function blankVariable(role: VariableRoleChoice): DeclaredVariable {
  return {
    id: makeId(),
    name: '',
    role,
    type: role === 'outcome' ? 'continuous' : 'categorical',
    ...(role === 'factor' ? { levels: 'few' as LevelBand } : {}),
  };
}

/** Readback for the collapsed step summary. */
export function describeVariables(variables: readonly DeclaredVariable[]): string {
  const outcomes = variables.filter((v) => v.role === 'outcome').length;
  const factors = variables.length - outcomes;
  const noun = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
  return `${noun(outcomes, 'outcome')} × ${noun(factors, 'factor')}`;
}

export function VariablesStep({ onDeclare, onCancel }: VariablesStepProps) {
  const [variables, setVariables] = useState<readonly DeclaredVariable[]>(() => [
    blankVariable('outcome'),
    blankVariable('factor'),
  ]);

  // Immutable updates throughout — house rule, and it keeps the row
  // list safe to render from state directly.
  const update = (id: string, patch: Partial<DeclaredVariable>) =>
    setVariables((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));

  const remove = (id: string) => setVariables((prev) => prev.filter((v) => v.id !== id));

  const add = (role: VariableRoleChoice) =>
    setVariables((prev) => [...prev, blankVariable(role)]);

  const ready = hasUsableOutcome(variables);
  const atCapacity = variables.length >= MAX_DECLARED_VARIABLES;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ margin: 0, fontSize: 13, color: '#8a8a95', lineHeight: 1.5 }}>
        Name what you measured and what you compared it across. We’ll draw the
        figure with stand-in numbers so you can see the shape before you have
        results.
      </p>

      {variables.map((variable, i) => (
        <div
          key={variable.id}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            border: '1px solid #1e1e2e',
            borderRadius: 10,
            padding: 12,
            background: '#0f0f17',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ ...labelStyle, marginBottom: 0, flex: 1 }}>
              Variable {i + 1}
            </label>
            {variables.length > 1 && (
              <button
                type="button"
                onClick={() => remove(variable.id)}
                aria-label={`Remove variable ${i + 1}`}
                style={{
                  ...buttonStyle,
                  minWidth: TARGET,
                  justifyContent: 'center',
                  padding: '0 10px',
                  color: '#8a8a95',
                }}
              >
                Remove
              </button>
            )}
          </div>

          <input
            type="text"
            value={variable.name}
            placeholder={
              variable.role === 'outcome' ? 'e.g. Reaction time (ms)' : 'e.g. Caffeine dose'
            }
            aria-label={`Variable ${i + 1} name`}
            onChange={(e) => update(variable.id, { name: e.target.value })}
            style={fieldStyle}
          />

          <Segmented
            legend="What is it?"
            options={ROLE_OPTIONS}
            value={variable.role}
            onChange={(role) =>
              update(variable.id, {
                role,
                // Keep the type coherent with the new role: a factor
                // defaults to groups, an outcome to a number.
                type: role === 'outcome' ? 'continuous' : 'categorical',
                ...(role === 'factor' ? { levels: variable.levels ?? 'few' } : {}),
              })
            }
          />

          <Segmented
            legend="Type"
            options={TYPE_OPTIONS}
            value={variable.type}
            onChange={(type) => update(variable.id, { type })}
          />

          {variable.role === 'factor' && variable.type === 'categorical' && (
            <Segmented
              legend="How many groups?"
              options={LEVEL_OPTIONS}
              value={variable.levels ?? 'few'}
              onChange={(levels) => update(variable.id, { levels })}
            />
          )}
        </div>
      ))}

      {!atCapacity && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" style={buttonStyle} onClick={() => add('outcome')}>
            + Something measured
          </button>
          <button type="button" style={buttonStyle} onClick={() => add('factor')}>
            + Something compared
          </button>
        </div>
      )}

      {/* Under-specified declarations are explained, never silently
          rejected — the button stays visible and disabled so the
          requirement is legible before the user hunts for it. */}
      {!ready && (
        <p style={{ margin: 0, fontSize: 13, color: '#8a8a95' }}>
          Add at least one measured variable that’s a number — that’s the value
          the figure plots.
        </p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button
          type="button"
          disabled={!ready}
          onClick={() => onDeclare(variables, describeVariables(variables))}
          style={{
            ...buttonStyle,
            border: 'none',
            background: ready ? '#7c6aed' : '#2a2a3a',
            color: ready ? '#ffffff' : '#6b6b76',
            fontWeight: 600,
            cursor: ready ? 'pointer' : 'default',
          }}
        >
          Show me the figure
        </button>
        <button type="button" style={buttonStyle} onClick={onCancel}>
          Back
        </button>
      </div>
    </div>
  );
}
