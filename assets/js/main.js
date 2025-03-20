document.addEventListener('DOMContentLoaded', function() {
  // Highlight the current page in the navigation
  const currentPath = window.location.pathname;
  const navLinks = document.querySelectorAll('.nav-link');
  
  navLinks.forEach(link => {
    const linkPath = link.getAttribute('href');
    if (currentPath === linkPath || 
        (currentPath.includes(linkPath) && linkPath !== '/')) {
      link.style.fontWeight = 'bold';
    }
  });
});