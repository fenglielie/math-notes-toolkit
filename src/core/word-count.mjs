export function countWords(text) {
  const characters = text.match(/\p{Script=Han}/gu) || [];
  const words = text.replace(/\p{Script=Han}/gu, ' ').match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || [];
  return characters.length + words.length;
}

export function countMarkdownWords(tokens) {
  const text = tokens.filter(token => token.type === 'inline').flatMap(token => token.children || [])
    .map(token => token.type === 'text' ? token.content : ' ').join(' ');
  return countWords(text);
}
