const API_BASE = ['localhost', '127.0.0.1'].includes(location.hostname)
  ? 'http://127.0.0.1:8787'
  : 'https://youdumb-api.bensonperry.workers.dev';

const form = document.querySelector('#deletion-form');
const input = document.querySelector('#deletion-input');
const status = document.querySelector('#deletion-status');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button');
  button.disabled = true;
  status.textContent = 'checking receipt…';
  try {
    const response = await fetch(`${API_BASE}/research/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deletionReceipt: input.value.trim() }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'The donation could not be deleted.');
    input.value = '';
    status.textContent = 'deleted. the donated transcript is gone.';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
