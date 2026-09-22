try {
  const saved = localStorage.getItem('math-notes-theme');
  document.documentElement.dataset.theme = saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
} catch { /* System color scheme remains available through CSS. */ }
