export function paginate(items, requestedPage, pageSize = 10) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const value = Number(requestedPage);
  const page = Math.min(totalPages, Math.max(1, Number.isSafeInteger(value) ? value : 1));
  return { page, totalPages, items: items.slice((page - 1) * pageSize, page * pageSize) };
}

export function pageNumbers(page, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const numbers = [...new Set([1, totalPages, page - 1, page, page + 1])].filter(n => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const result = [];
  for (const number of numbers) {
    const previous = result.at(-1);
    if (number - previous === 2) result.push(previous + 1);
    else if (number - previous > 2) result.push(null);
    result.push(number);
  }
  return result;
}
