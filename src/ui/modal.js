export function openModal({ title, body, footer }) {
  const dialog = document.createElement('dialog');

  dialog.innerHTML = `
    <div class="modal-header">
      <h2>${escHtml(title)}</h2>
      <button class="close-btn" aria-label="Close">&times;</button>
    </div>
    <div class="modal-body"></div>
    <div class="modal-footer"></div>
  `;

  const bodyEl = dialog.querySelector('.modal-body');
  const footerEl = dialog.querySelector('.modal-footer');

  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body instanceof Node) bodyEl.appendChild(body);

  if (typeof footer === 'string') footerEl.innerHTML = footer;
  else if (footer instanceof Node) footerEl.appendChild(footer);

  dialog.querySelector('.close-btn').addEventListener('click', () => close());

  dialog.addEventListener('click', e => {
    if (e.target === dialog) close();
  });

  document.body.appendChild(dialog);
  dialog.showModal();

  function close() {
    dialog.close();
    dialog.remove();
  }

  return { close, dialog, bodyEl };
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
