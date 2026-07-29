/**
 * VibeField — optional vibe input + 2 recommended prompts.
 *
 * Presentational component with an optional text input and 2 tappable
 * suggestion prompts. Honest copy, no AI framing. The user can either
 * type a custom vibe description or tap a suggestion to fill and submit.
 *
 * onSubmit(vibe) is called when:
 * - A suggestion is tapped
 * - Enter is pressed in the text input
 *
 * Task 10 will wire onSubmit to re-run the Arm T (theme) layer only.
 */

interface VibeFieldProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (vibe: string) => void;
  suggestions?: string[];
}

const DEFAULT_SUGGESTIONS = [
  'Clean & minimal, lots of whitespace',
  'Confident & bold, strong headline emphasis',
];

export function VibeField({
  value,
  onChange,
  onSubmit,
  suggestions = DEFAULT_SUGGESTIONS,
}: VibeFieldProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSubmit(value);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    onSubmit(suggestion);
  };

  return (
    <div className="space-y-3">
      {/* Text input */}
      <input
        type="text"
        placeholder="Describe the vibe, or leave blank to follow your narrative"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full rounded-md border border-[#3a3a4e] bg-[#0f0f16] px-4 py-2.5 text-sm text-[#c8cad0] placeholder-[#6b7280] focus:border-[#7c6aed] focus:outline-none focus:ring-1 focus:ring-[#7c6aed]"
      />

      {/* Suggested prompts */}
      <div className="flex flex-col gap-2">
        {suggestions.map((suggestion, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleSuggestionClick(suggestion)}
            className="rounded-md border border-[#3a3a4e] bg-[#0f0f16] px-4 py-2 text-left text-xs text-[#c8cad0] transition-colors hover:border-[#7c6aed] hover:text-white"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
