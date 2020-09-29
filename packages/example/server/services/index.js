const messages = require('./messages/messages.service.js');
const book = require('./book/book.service.js');
// eslint-disable-next-line no-unused-vars
module.exports = function (app) {
  app.configure(messages);
  app.configure(book);
};
