const fs = require('fs');
const content = fs.readFileSync('backend/server.js', 'utf8');
let braces = 0;
let line = 1;
for (let i = 0; i < content.length; i++) {
  if (content[i] === '\n') {
    if (braces === 0) console.log(`Balance zero at line ${line}`);
    line++;
  }
  if (content[i] === '{') braces++;
  if (content[i] === '}') braces--;
}
console.log(`Final balance: ${braces}`);
