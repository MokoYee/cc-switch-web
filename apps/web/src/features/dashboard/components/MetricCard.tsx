interface MetricCardProps {
  readonly label: string;
  readonly value: string | number;
  readonly hint: string;
}

export const MetricCard = ({ label, value, hint }: MetricCardProps): JSX.Element => (
  <article className="metric-card">
    <span>{label}</span>
    <strong>{value}</strong>
    <small>{hint}</small>
  </article>
);
