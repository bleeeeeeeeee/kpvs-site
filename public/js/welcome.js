document.querySelector('.mens').addEventListener('click', () => {
  window.location.href = 'mens.html';
});

document.querySelector('.womens').addEventListener('click', () => {
  window.location.href = 'womens.html';
});

const allBtn = document.getElementById('all-catalog-btn');
if (allBtn) {
  allBtn.addEventListener('click', () => {
    window.location.href = 'all.html';
  });
}
