require('dotenv').config();
console.log('DISCORD_TOKEN:', process.env.DISCORD_TOKEN ? `FOUND (${process.env.DISCORD_TOKEN.substring(0, 5)}...)` : 'MISSING');
console.log('Kai:', process.env.Kai ? 'FOUND' : 'MISSING');
console.log('Current Dir:', process.cwd());
console.log('Env file path:', require('path').resolve('.env'));
