// Keep the three pleats in sync with the pre-React launch markup in index.html.
export function FoldMark({ moving = false }: { moving?: boolean }) {
  return (
    <span
      data-slot="fold-mark"
      data-moving={moving || undefined}
      aria-hidden="true"
    >
      <i />
      <i />
      <i />
    </span>
  );
}
