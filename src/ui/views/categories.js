import { getData, addCategory, updateCategory, deleteCategory } from '../../store.js';
import { openModal } from '../modal.js';
import { toast } from '../toast.js';

let _container = null;

export function render(container) {
  _container = container;
  refresh();
}

function refresh() {
  const { categories } = getData();
  _container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'page-header';
  header.innerHTML = `
    <h1>Categories</h1>
    <button class="btn btn-primary" id="add-cat">+ Add category</button>
  `;
  _container.appendChild(header);

  const list = document.createElement('div');
  list.className = 'list';

  if (categories.length === 0) {
    list.innerHTML = '<div class="list-empty">No categories yet. Add one to get started.</div>';
  } else {
    for (const cat of categories) {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `
        <span class="color-swatch" style="width:20px;height:20px;border-radius:50%;background:${escHtml(cat.color)};flex-shrink:0"></span>
        <span style="flex:1;font-weight:500">${escHtml(cat.name)}</span>
        <button class="btn btn-sm btn-secondary edit-btn">Edit</button>
        <button class="btn btn-sm btn-danger del-btn">Delete</button>
      `;
      row.querySelector('.edit-btn').addEventListener('click', () => openCategoryModal(cat));
      row.querySelector('.del-btn').addEventListener('click', () => confirmDelete(cat));
      list.appendChild(row);
    }
  }

  _container.appendChild(list);

  _container.querySelector('#add-cat').addEventListener('click', () => openCategoryModal(null));
}

function openCategoryModal(cat) {
  const isEdit = cat !== null;
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="form-group">
      <label for="cat-name">Name</label>
      <input type="text" id="cat-name" value="${escHtml(cat?.name ?? '')}" placeholder="e.g. Groceries" autocomplete="off">
    </div>
    <div class="form-group">
      <label for="cat-color">Color</label>
      <input type="color" id="cat-color" value="${cat?.color ?? '#6366f1'}" style="height:40px;padding:0.25rem">
    </div>
  `;

  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:0.5rem;justify-content:flex-end';
  footer.innerHTML = `
    <button class="btn btn-secondary cancel-btn">Cancel</button>
    <button class="btn btn-primary save-btn">${isEdit ? 'Save' : 'Add'}</button>
  `;

  const { close } = openModal({ title: isEdit ? 'Edit category' : 'New category', body, footer });

  footer.querySelector('.cancel-btn').addEventListener('click', close);
  footer.querySelector('.save-btn').addEventListener('click', () => {
    const name = body.querySelector('#cat-name').value.trim();
    const color = body.querySelector('#cat-color').value;
    if (!name) {
      body.querySelector('#cat-name').focus();
      return;
    }
    if (isEdit) {
      updateCategory(cat.id, { name, color });
      toast('Category updated', 'success');
    } else {
      addCategory(name, color);
      toast('Category added', 'success');
    }
    close();
    refresh();
  });

  setTimeout(() => body.querySelector('#cat-name').focus(), 50);
}

function confirmDelete(cat) {
  const body = document.createElement('p');
  body.textContent = `Delete "${cat.name}"? Existing transactions will keep a reference to it (shown as deleted).`;

  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:0.5rem;justify-content:flex-end';
  footer.innerHTML = `
    <button class="btn btn-secondary cancel-btn">Cancel</button>
    <button class="btn btn-danger confirm-btn">Delete</button>
  `;

  const { close } = openModal({ title: 'Delete category', body, footer });

  footer.querySelector('.cancel-btn').addEventListener('click', close);
  footer.querySelector('.confirm-btn').addEventListener('click', () => {
    deleteCategory(cat.id);
    toast('Category deleted', 'success');
    close();
    refresh();
  });
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
