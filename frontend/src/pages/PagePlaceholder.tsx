interface Props {
  title: string;
}

export function PagePlaceholder({ title }: Props) {
  return (
    <section>
      <h1>{title}</h1>
      <p style={{ color: "var(--color-text-muted)" }}>구현 예정</p>
    </section>
  );
}
