const fs = require('fs');
const pdf = require('pdf-parse');
const path = require('path');

const file = path.join(process.cwd(), 'data', 'Civile New', 'Notariato 3.pdf');
const dataBuffer = fs.readFileSync(file);

console.log(typeof pdf);
console.log(Object.keys(pdf));

if (typeof pdf === 'function') {
    pdf(dataBuffer).then(data => {
        console.log(data.text.substring(0, 100));
    }).catch(console.error);
} else if (typeof pdf === 'object' && typeof pdf.default === 'function') {
    pdf.default(dataBuffer).then(data => {
        console.log(data.text.substring(0, 100));
    }).catch(console.error);
} else {
    // maybe we can just try pdf(dataBuffer)
    try {
        pdf(dataBuffer);
    } catch(e) {
        console.error(e);
    }
}
