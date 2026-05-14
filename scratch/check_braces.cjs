const fs = require('fs');
const content = fs.readFileSync('server.js', 'utf8');
let open = 0;
for (let i = 0; i < content.length; i++) {
    if (content[i] === '{') open++;
    if (content[i] === '}') open--;
}
console.log('Open braces count:', open);
