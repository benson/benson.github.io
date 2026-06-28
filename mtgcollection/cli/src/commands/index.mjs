import login from './login.mjs';
import logout from './logout.mjs';
import whoami from './whoami.mjs';

// Registry. commandOrder controls help-listing order.
export const commands = {
  login,
  logout,
  whoami,
};

export const commandOrder = Object.keys(commands);
