// Shared by the browser and tests. Substring matching works for Chinese and TeX
// without a remote search service or a language-specific tokenizer.
export function search(documents, query, { includePdfContent = false } = {}) {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return documents.map(doc => {
    const title = doc.title.toLocaleLowerCase();
    const tags = doc.tags.join(' ').toLocaleLowerCase();
    const body = doc.text + (includePdfContent && doc.pdfText ? '\n' + doc.pdfText : '');
    const text = body.toLocaleLowerCase();
    const score = terms.reduce((sum, term) => {
      if (!title.includes(term) && !tags.includes(term) && !text.includes(term)) return -Infinity;
      return sum + (title.includes(term) ? 10 : 0) + (tags.includes(term) ? 5 : 0) + (text.includes(term) ? 1 : 0);
    }, 0);
    const position = text.indexOf(terms.find(t => text.includes(t)) || '');
    const start = Math.max(0, position - 45);
    return { ...doc, score, snippet: (start ? '…' : '') + body.slice(start, start + 180) + (body.length > start + 180 ? '…' : '') };
  }).filter(doc => Number.isFinite(doc.score)).sort((a, b) => b.score - a.score || b.date.localeCompare(a.date));
}
