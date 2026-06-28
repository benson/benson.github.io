import login from './login.mjs';
import logout from './logout.mjs';
import whoami from './whoami.mjs';
import search from './search.mjs';
import summary from './summary.mjs';
import ls from './ls.mjs';
import show from './show.mjs';
import deck from './deck.mjs';
import add from './add.mjs';
import rm from './rm.mjs';
import move from './move.mjs';
import edit from './edit.mjs';
import tag from './tag.mjs';
import container from './container.mjs';
import undo from './undo.mjs';
import importCmd from './import.mjs';
import exportCmd from './export.mjs';

// Registry. commandOrder controls help-listing order.
export const commands = {
  login,
  logout,
  whoami,
  search,
  summary,
  ls,
  show,
  deck,
  add,
  rm,
  move,
  edit,
  tag,
  container,
  undo,
  import: importCmd,
  export: exportCmd,
};

export const commandOrder = Object.keys(commands);
