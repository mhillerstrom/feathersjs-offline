// Initializes the `book` service on path `/book`
const { Book } = require('./book.class');
const hooks = require('./book.hooks');

module.exports = function (app) {
  const options = {
    paginate: app.get('paginate')
  };

  // Initialize our service with any options it requires
  app.use('/book', new Book(options, app));

  // Get our initialized service so that we can register hooks
  const service = app.service('book');

  service.hooks(hooks);
};
