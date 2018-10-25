const fs = require('fs');
const Message = require('..');

const message = new Message({ }, 'hello');

message.from = 'liusong02@meituan.com';
message.to = 'Liu song <hi@lsong.org>';

console.log(message.toString());

// message.on('end', (headers, body) => {
//   console.log(body);
// });

// fs.createReadStream(__dirname + '/../docs/smtp-qq.txt').pipe(message);

// const type = new Message.Header({
//   name: 'content-type',
//   value: 'text/html',
//   options: { a: 1, b:2 }
// });

// const html = new Message([
//   type,
// ], '<h1>Hello text/html</h1>');

// const message = new Message({
//   From: 'mail@lsong.org',
//   To: 'hi@lsong.org',
//   Subject: 'hello world',
//   type
// }, [
//   html, 'hello text/plain!'
// ]);

// console.log(message.toString());