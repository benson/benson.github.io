import login from './login.mjs';
import logout from './logout.mjs';
import whoami from './whoami.mjs';
import search from './search.mjs';
import summary from './summary.mjs';
import ls from './ls.mjs';
import show from './show.mjs';
import deck from './deck.mjs';

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
};

export const commandOrder = Object.keys(commands);
