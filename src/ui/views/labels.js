import { getData, addLabel, updateLabel, deleteLabel } from '../../store.js';
import { openModal } from '../modal.js';
import { toast } from '../toast.js';

let _container = null;

export function render(container) {
  _container = container;
  refresh();
}

function refresh() {
  const { labels } = getData();
  _container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'page-header';
  header.innerHTML = `
    <h1>Labels</h1>
    <button class="btn btn-primary" id="add-lbl">+ Add label</button>
  `;
  _container.appendChild(header);

  const list = document.createElement('div');
  list.className = 'list';

  if (labels.length === 0) {
    list.innerHTML = '<div class="list-empty">No labels yet. Add one to get started.</div>';
  } else {
    for (const lbl of labels) {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `
        <span style="flex:1;font-weight:500">${escHtml(lbl.name)}</span>
        <button class="btn btn-sm btn-secondary edit-btn">Edit</button>
        <button class="btn btn-sm btn-danger del-btn">Delete</button>
      `;
      row.querySelector('.edit-btn').addEventListener('click', () => openLabelModal(lbl));
      row.querySelector('.del-btn').addEventListener('click', () => confirmDelete(lbl));
      list.appendChild(row);
    }
  }

  _container.appendChild(list);
  _container.querySelector('#add-lbl').addEventListener('click', () => openLabelModal(null));
}

function openLabelModal(lbl) {
  const isEdit = lbl !== null;
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="form-group">
      <label for="lbl-name">Name</label>
      <input type="text" id="lbl-name" value="${escHtml(lbl?.name ?? '')}" placeholder="e.g. work-trip" autocomplete="off">
    </div>
  `;

  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:0.5rem;justify-content:flex-end';
  footer.innerHTML = `
    <button class="btn btn-secondary cancel-btn">Cancel</button>
    <button class="btn btn-primary save-btn">${isEdit ? 'Save' : 'Add'}</button>
  `;

  const { close } = openModal({ title: isEdit ? 'Edit label' : 'New label', body, footer });

  footer.querySelector('.cancel-btn').addEventListener('click', close);
  footer.querySelector('.save-btn').addEventListener('click', () => {
    const name = body.querySelector('#lbl-name').value.trim();
    if (!name) { body.querySelector('#lbl-name').focus(); return; }
    if (isEdit) {
      updateLabel(lbl.id, { name });
      toast('Label updated', 'success');
    } else {
      addLabel(name);
      toast('Label added', 'success');
    }
    close();
    refresh();
  });

  setTimeout(() => body.querySelector('#lbl-name').focus(), 50);
}

function confirmDelete(lbl) {
  const body = document.createElement('p');
  body.textContent = `Delete "${lbl.name}"? Existing transactions will keep a reference to it (shown as deleted).`;

  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:0.5rem;justify-content:flex-end';
  footer.innerHTML = `
    <button class="btn btn-secondary cancel-btn">Cancel</button>
    <button class="btn btn-danger confirm-btn">Delete</button>
  `;

  const { close } = openModal({ title: 'Delete label', body, footer });
  footer.querySelector('.cancel-btn').addEventListener('click', close);
  footer.querySelector('.confirm-btn').addEventListener('click', () => {
    deleteLabel(lbl.id);
    toast('Label deleted', 'success');
    close();
    refresh();
  });
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
