import { t } from '../js/i18n.js';

// The database enforces writes. Check the current staff profile before a form
// starts reading inventory, opening the scanner or collecting information.
export async function workflowAccess(db, userId) {
  let profile;
  try {
    profile = await db.loadMyProfile({ verifyAccess: true });
  } catch {
    return 'unverified';
  }
  if (!userId || profile?.id !== userId) return 'unverified';
  return db.canEditWarehouse(profile.role) === true ? 'staff' : 'restricted';
}

export function showWorkflowGate(access) {
  const main = document.querySelector('main');
  const panel = document.createElement('section');
  panel.className = 'flow workflow-gate';
  const heading = document.createElement('h1');
  heading.textContent = t(access === 'restricted' ? 'gate.title' : 'gate.verifyTitle');
  const note = document.createElement('p');
  note.textContent = t(access === 'restricted' ? 'gate.body' : 'gate.verifyBody');
  const actions = document.createElement('div');
  actions.className = 'flow-actions';
  const board = document.createElement('a');
  board.className = 'btn';
  board.href = 'dashboard.html';
  board.textContent = t('nav.board');
  const retry = document.createElement('button');
  retry.className = 'btn btn-primary';
  retry.type = 'button';
  retry.textContent = t('print.retry');
  retry.addEventListener('click', () => location.reload());
  actions.append(board, retry);
  panel.append(heading, note, actions);
  // Preserve the shell header and its navigation. Inert prevents hidden form
  // controls from receiving focus, including after deep-link focus restores.
  for (const child of main.children) {
    if (child.matches('.top')) continue;
    child.hidden = true;
    child.inert = true;
    child.style.display = 'none';
  }
  main.append(panel);
}
