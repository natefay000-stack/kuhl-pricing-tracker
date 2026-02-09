// Clear localStorage cache
if (typeof window !== 'undefined') {
  localStorage.clear();
  console.log('Cache cleared');
  window.location.reload();
}
