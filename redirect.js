// Automatically open ChatGPT when the page loads
window.addEventListener('DOMContentLoaded', () => {
  const link = document.getElementById('chatgpt');
  if (link) link.click();
});
