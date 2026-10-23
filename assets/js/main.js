document.addEventListener('DOMContentLoaded', function() {
  // Mark the sidebar link for the current section
  const path = window.location.pathname.replace(/index\.html$/, '');
  document.querySelectorAll('.site-nav .nav-group a').forEach(link => {
    const href = link.getAttribute('href');
    const inBlog = href === '/blogs.html' && path.startsWith('/blogs/');
    if (path === href || inBlog) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    }
  });
});
