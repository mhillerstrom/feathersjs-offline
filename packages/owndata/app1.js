// Testing as an app...
const feathers = require('@feathersjs/feathers');
const ls = require('feathers-localstorage');
const { owndataWrapper } = require('./lib/index');
const { genUuid, to } = require('@feathersjs-offline/common');
const LocalStorage = require('node-localstorage').LocalStorage;
const localStorage = new LocalStorage('./ls.data');

let app = feathers();

// Initialize the localStorage keys ('sb' and 'sb2') to pre-fill the databases
localStorage.setItem('sb', JSON.stringify({0: {name: 'Sandbox', gender: 'no gender', id: 0}}) );
localStorage.setItem('sb2', JSON.stringify({0: {name: 'Sandbox2', gender: 'no gender', id: 0}, 1: {name: 'Sandbox2', gender: 'no gender', id: 1}}) );
localStorage.setItem('sb3', JSON.stringify({0: {name: 'Sandbox3', gender: 'no gender', id: 0}, 1: {name: 'Sandbox3', gender: 'no gender', id: 1}}) );

// Define the services
app.use('/sandbox', ls({ multi: true, name: 'sb', storage: localStorage, startId: 10 }));
app.use('/sandbox2', ls({ multi: true, name: 'sb2', storage: localStorage, startId: 20 }));
app.use('/sandbox3', ls({ multi: false, name: 'sb3', storage: localStorage, startId: 20 }));

// Initialize the offline (owndata) wrapper
owndataWrapper(app, app.service('sandbox2'),{adapterTest: true});
owndataWrapper(app, app.service('sandbox3'),{adapterTest: true});

// Define the api
const api = {
  messages: app.service('messages'),
  users: app.service('users'),
  sandbox: app.service('sandbox'),
  sandbox2: app.service('sandbox2'),
  sandbox3: app.service('sandbox3')
}

// Let's test the services
const testLocal = async function () {
  // Make sure all changes are committed to LocalStorage (feathers-localstorage throttle defaults to 200ms)
  await new Promise(resolve => setTimeout(resolve, 300))

  // First we see any records already in 'sandbox'
  let [err, res] = await to( api.sandbox.find() );
  if (err) {
    console.log(`Unexpected error: ${JSON.stringify(err)}`);
  }
  else {
    console.log(`Find all from sandbox: ${JSON.stringify(res)}`);
  }

  // Next we add some documents to 'sandbox'
  [err, res] = await to( api.sandbox.create(
    [ {name: 'Tarzan', gender: 'male'},
      {name: 'Jane', gender: 'female'}
    ]) );
  if (err) {
    console.error(`Error creating sandbox data: err = ${JSON.stringify(err)}`);
    throw new Error('Shouldn\'t happen!');
  }
  else
    console.log(`Created locally sandbox: ${JSON.stringify(res)}`);

  // Now we display the documents with gender='male' from 'sandbox'
  [err, res] = await to( api.sandbox.find({query:{gender: 'male'}}) );
  console.log(`Gender male from sandbox: ${JSON.stringify(res)}`);

  // Next we add some documents to 'sandbox2'
  [err, res] = await to( api.sandbox2.create(
    [ {name: 'Batman', gender: 'male'},
      {name: 'Robin', gender: 'male'}
    ]) );
  if (err) {
  console.error(`Error creating sandbox2 data: err = ${JSON.stringify(err)}`);
  throw new Error('Shouldn\'t happen!');
  }
  console.log(`Created locally sandbox2: ${JSON.stringify(res)}`);

  // Now we display the documents from 'sandbox2'
  [err, res] = await to( api.sandbox2.find() );
  console.log(`All items from sandbox2: ${JSON.stringify(res)}`);

};

testLocal()
  .then(async _res => {
    // Make sure all changes are committed to LocalStorage (feathers-localstorage throttle defaults to 200ms)
    await new Promise(resolve => setTimeout(resolve, 300))

    // Let's see the final result of testLocal() (api.messages.find())
    console.log(`testLocal _res=${JSON.stringify(_res)}`);

    // Let's display localStorage
    let [err, res] = await to( api.sandbox.find() );
    console.log(`III Find all from sandbox: ${JSON.stringify(res,null,2)}`);
    [err, res] = await to( api.sandbox2.find() );
    console.log(`III Find all from sandbox2: ${JSON.stringify(res,null,2)}`);

    // Other tests
    console.log('>>>>>>>>>>>> Test 1:');
    try {
      await api.sandbox3.remove(null);
      throw new Error('Should never get here');
    } catch (error) {
      if (error.name !== 'MethodNotAllowed') {
        console.error('***Removing multiple without option set throws MethodNotAllowed***');
      }
    }

    console.log('>>>>>>>>>>>> Test 2:');
    // api.sandbox3.options = {multi: [ 'remove' ]};
    api.sandbox3.options.multi = [ 'remove' ];
    console.log(`sandbox3.options = ${JSON.stringify(api.sandbox3.options)}`)
    console.log(`sandbox3.remoteService.options = ${JSON.stringify(api.sandbox3.remoteService.options)}`)

    console.log('>>>>>>>>>>>> Test 3:');
    await api.sandbox3.create({ name: 'Dave', age: 29, created: true });
    await api.sandbox3.create({
      name: 'David',
      age: 3,
      created: true
    });

    console.log('>>>>>>>>>>>> Test 4:');
    let data = await api.sandbox3.remove(null, {
      query: { created: true }
    });

    if (data.length !== 2) {
      console.log(`data.length(${data.length}) differs from 2!!!!`);
    };

    const names = data.map((person) => person.name);

    if (names.includes('Dave'))
      console.log('Dave removed');
    if (names.includes('David'))
      console.log('David removed');

      console.log('>>>>>>>>>>>> Test 5:');
      const idProp = 'id';
      const doug = await api.sandbox3.create({
        name: 'Doug',
        age: 32
      });
      data = await api.sandbox3.remove(doug[idProp], {
        query: { $select: [ 'name' ] }
      });

      console.log(`data = ${JSON.stringify(data)}`);
      if (data.name === 'Doug')
        console.log('data.name matches');
      if (!data.age)
        console.log('data.age is falsy');

    process.exit();
  })
  .catch(err => {
    err = err;
    console.error(`testLocal caught err=${parseErrors(err, true)}`)
    process.exit();
  });

  // Utility function
  const parseErrors = function parseErrors (err, showStack = false) {
    if (err.name) {
      if (!showStack) {
        return err.message
      }
      return err.message + '\n' + err.stack;
    } else {
      return _.map(_.get(err, 'errors', []), err =>
        err.message
          .replace('Path ', '')
          .replace('`', '')
          .replace('`', ''))
        .join('<br>')
    }
}
