const https = require('https');
const fs = require('fs');
const path = require('path');

const EXTENDSCLASS_BIN = 'https://extendsclass.com/api/json-storage/bin/cadceef';

const action = process.argv[2];
const targetFile = process.argv[3];

if (!action || !targetFile) {
  process.exit(1);
}

if (action === 'pull') {
  https.get(EXTENDSCLASS_BIN, res => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        if (parsed && parsed.users) {
          fs.writeFileSync(targetFile, body, 'utf8');
          process.exit(0);
        } else {
          process.exit(1);
        }
      } catch (e) {
        process.exit(1);
      }
    });
  }).on('error', () => {
    process.exit(1);
  });
} else if (action === 'push') {
  try {
    const data = fs.readFileSync(targetFile, 'utf8');
    const req = https.request(EXTENDSCLASS_BIN, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      }
    }, res => {
      res.on('data', () => {});
      res.on('end', () => {
        if (res.statusCode === 200) {
          process.exit(0);
        } else {
          process.exit(1);
        }
      });
    });
    req.on('error', () => {
      process.exit(1);
    });
    req.write(data);
    req.end();
  } catch (e) {
    process.exit(1);
  }
}
