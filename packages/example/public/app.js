/* eslint-disable no-undef */
const app = feathers();
window.app = app;
const ioLocation = "http://localhost:3030";
const socket = io(ioLocation);
console.log(`connecting to: ${ioLocation}...`);
let offlineService = null;

app.configure(feathers.socketio(socket));

// Show a message in message window
const showMessage = function (text) {
  console.log(`showMessage('${JSON.stringify(text)}')`);
  let node = document.createElement('DIV');
  let textNode = document.createTextNode(text);
  node.appendChild(textNode);
  document.getElementById('contents').appendChild(node);
  document.getElementById('contents').scrollTop = 0;
};

// Cleat message window
const clearContents = function () {
  document.getElementById('contents').innerHTML = '';
};

// Dummy subscriber...
const subscriber = function (...args) {
  console.log(`subscriber called with ${JSON.stringify(args)}`);
};

// Handle radio buttons...
let serviceType = sessionStorage.getItem('serviceType');
if (!serviceType || serviceType!== '') serviceType = 'standard';
document.getElementById(serviceType).checked = true;
sessionStorage.setItem('serviceType', serviceType);

const handleToggle = function(ev) {
  let id = ev.currentTarget.id;
  let serviceType = sessionStorage.getItem('serviceType');
  let newStandard = id;
  if (serviceType != newStandard) {
    document.getElementById(id).checked = true;
    sessionStorage.setItem('serviceType', newStandard);
    serviceType = newStandard;
    prepareService();
    getServiceData();
  }
};

// eslint-disable-next-line no-unused-vars
document.getElementById('standard').addEventListener('click', async ev => {
  handleToggle(ev);
});
// eslint-disable-next-line no-unused-vars
document.getElementById('owndata').addEventListener('click', async ev => {
  handleToggle(ev);
});
// eslint-disable-next-line no-unused-vars
document.getElementById('ownnet').addEventListener('click', async ev => {
  handleToggle(ev);
});

//
// Start of application
//
let serviceName = 'messages';
let messages = [];
let messageCounter = 0;

const getServiceName = function (service) {
  console.log('Looking for service name...');
  for (s in app.services)
    if (app.services[s] === service)
      return s;

  return 'unknown';
};

const wrapper = {
  'standard': (app, path, o) => {},
  'owndata': feathersjsOfflineOwndata.owndataWrapper,
  'ownnet': feathersjsOfflineOwnnet.ownnetWrapper
}

// Setup service according to users choice
const prepareService = function () {
  // User wants to try serviceType i.e. either standard, own-data, or own-net
  if (!(feathersjsOfflineOwndata && feathersjsOfflineOwnnet && feathersjsOfflineServer)) {
    alert('Could not load \'feathers-offline\' libraries. Please check.');
  }
  else {
    delete app.services[serviceName];
    wrapper[serviceType](app, serviceName, {store: 'xxx'});
    app.service(serviceName).timeout = 200;  // only here to force quicker return when running standard
  }
};
prepareService(); // Setup service at load/reload

const getServiceData = function() {
  // Get data from server and display
  app.service(serviceName).find()
    .then(myres => {
      let res = myres;
      console.log(`returned from find: res = ${JSON.stringify(myres)}`);
      if (typeof myres.length !== 'undefined') {
        res.data = myres;
      }
      messageCounter = res.data.length;
      messages = res.data;
      clearContents();
      messages.forEach(mes => showMessage(mes.text));
    })
    .catch(err => {
      alert(`Could not read messages from server! err=${JSON.stringify(err)}`);
    });
};
getServiceData(); // Get data at load/reload

// Handle the 'Add Message' button
// eslint-disable-next-line no-unused-vars
document.getElementById('add').addEventListener('click', async _ev => {
  let text = `A new message #${++messageCounter}`;
  app.service(serviceName).create({ text })
    .then((res) => {
      showMessage(res.text);
      messages.push(res);
    })
    .catch((err) => {
      messageCounter--;
      alert(`Ups! Something went wrong inserting new message '${text}'.\nerr=${JSON.stringify(err)}`);
    });
});
