export function createTextSearch(query: string): (text: string) => boolean {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return (text) => {
    const normalized = text.toLocaleLowerCase();
    return terms.every((term) => normalized.includes(term));
  };
}
