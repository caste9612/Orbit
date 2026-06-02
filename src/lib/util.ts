/** Nome finale di un percorso (gestisce separatori sia `/` che `\`). */
export function basename(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}
