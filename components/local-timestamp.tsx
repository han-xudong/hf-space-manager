type Props = {
  value: string | null;
  emptyLabel?: string;
};

function formatLocalTimestamp(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "invalid";
  }

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function LocalTimestamp({ value, emptyLabel = "never" }: Props) {
  if (!value) {
    return <span>{emptyLabel}</span>;
  }

  return (
    <time dateTime={value} suppressHydrationWarning>
      {formatLocalTimestamp(value)}
    </time>
  );
}