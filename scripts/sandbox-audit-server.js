import {start} from '../src/server/index.js';

// This entrypoint is dedicated to the disposable SPOOKY sandbox UI inspection.
// It never opens the operator's configured persistent SQLite database.
if(process.env.SPOOKY_SANDBOX!=='1'){
  throw new Error('This entrypoint is reserved for an approved SPOOKY_SANDBOX job.');
}
process.env.EASYWINE_DB=':memory:';
process.env.HOST='127.0.0.1';
process.env.NODE_ENV='test';
delete process.env.EASYWINE_ORIGIN;
delete process.env.EASYWINE_MFA_KEY;
delete process.env.EASYWINE_MFA_KEY_FILE;
start();
