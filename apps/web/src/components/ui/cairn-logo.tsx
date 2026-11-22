export function CairnMark({
  moving = false,
  large = false,
}: {
  moving?: boolean;
  large?: boolean;
}) {
  return (
    <span
      data-slot="cairn-mark"
      data-large={large || undefined}
      data-moving={moving || undefined}
      aria-hidden="true"
    />
  );
}

export function CairnLogo({ name = "Kairn" }: { name?: string }) {
  if (name !== "Kairn") {
    return (
      <span className="inline-flex items-center gap-2 font-heading font-bold">
        <CairnMark />
        {name}
      </span>
    );
  }
  return <span role="img" aria-label={name} data-slot="cairn-logo" />;
}
