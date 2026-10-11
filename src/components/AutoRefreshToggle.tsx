interface AutoRefreshToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  seconds: number;
}

export function AutoRefreshToggle({ checked, onChange, seconds }: AutoRefreshToggleProps) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      Auto-refresh every {seconds}s
    </label>
  );
}
