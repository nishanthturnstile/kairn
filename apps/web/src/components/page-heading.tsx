export function PageHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <header className="grid gap-2">
      <h1 className="text-4xl font-semibold">{title}</h1>
      {description && (
        <p className="max-w-prose text-muted-foreground">{description}</p>
      )}
    </header>
  );
}
