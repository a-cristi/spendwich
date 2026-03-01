let _container = null;

export function render(container) {
  _container = container;
  refresh();
}

function refresh() {
  _container.innerHTML = '<p class="placeholder">Labels — coming soon</p>';
}
