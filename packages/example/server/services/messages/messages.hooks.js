
module.exports = {
  before: {
    all: [],
    find: [],
    get: [],
    create: [context => {
      console.log(`data = ${JSON.stringify(context.data)}`);
      return context;
    }],
    update: [],
    patch: [],
    remove: []
  },

  after: {
    all: [],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: []
  },

  error: {
    all: [],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: []
  }
};
