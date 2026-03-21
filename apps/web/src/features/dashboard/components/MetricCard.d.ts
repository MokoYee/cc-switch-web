interface MetricCardProps {
    readonly label: string;
    readonly value: string | number;
    readonly hint: string;
}
export declare const MetricCard: ({ label, value, hint }: MetricCardProps) => JSX.Element;
export {};
