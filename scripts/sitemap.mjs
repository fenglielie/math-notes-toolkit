const escapeXml = value => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
})[char]);

export function sitemap(config, posts) {
  if (!config.url) return null;
  const routes = [config.base];
  for (let page = 2; page <= Math.ceil(posts.length / config.pageSize); page++) {
    routes.push(config.base + 'page/' + page + '/');
  }
  routes.push(...posts.map(post => post.href));
  const entries = routes.map(route => '  <url><loc>' + escapeXml(new URL(config.url + route).href) + '</loc></url>');
  // Publication dates and build timestamps are not reliable modification dates.
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + entries.join('\n') + '\n</urlset>\n';
}
