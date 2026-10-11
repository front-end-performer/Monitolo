interface MetricCardProps {
  label: string;
  value: string;
  detail?: string;
  /** 0–100: draws a usage bar under the value. */
  percent?: number;
}

export function MetricCard({ label, value, detail, percent }: MetricCardProps) {
  return (
    <section className="card metric">
      <h3 className="metric-label">{label}</h3>
      <p className="metric-value">{value}</p>
      {percent !== undefined && (
        // Decorative: the same number is already in the text above.
        <div className="bar" aria-hidden>
          <div className={`bar-fill ${percent > 85 ? 'bar-high' : ''}`} style={{ width: `${percent}%` }} />
        </div>
      )}
      {detail && <p className="metric-detail">{detail}</p>}
    </section>
  );
}
