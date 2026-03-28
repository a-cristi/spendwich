import { escHtml } from './utils.js';

export function openModal({ title, subtitle, deco, body, footer }) {
  const dialog = document.createElement('dialog');
  const isStyled = subtitle || deco;
  if (isStyled) dialog.classList.add('modal-styled');

  const headerContent = subtitle
    ? `<div>
         <p class="modal-subtitle">${escHtml(subtitle)}</p>
         <h2 class="modal-title">${escHtml(title)}</h2>
       </div>`
    : `<h2>${escHtml(title)}</h2>`;

  const headerHTML = `
    <div class="modal-header${subtitle ? ' modal-header--styled' : ''}">
      ${headerContent}
      <button class="close-btn" aria-label="Close">&times;</button>
    </div>
    <div class="modal-body"></div>
    <div class="modal-footer"></div>
  `;

  if (deco) {
    dialog.innerHTML = `
      <div class="modal-inner">
        <div class="modal-main">${headerHTML}</div>
        <div class="modal-deco">
          <div class="modal-deco-text">${escHtml(deco)}</div>
          <div class="modal-deco-line"></div>
        </div>
      </div>
    `;
  } else {
    dialog.innerHTML = headerHTML;
  }

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
