function EndpointOffline (service, options = {}, filterQueryFn = ()=>{}) {
  debug(`EndpointOffline called with:\tservice = ${service}\n\toptions = ${JSON.stringify(options)}\n\tfilterQueryFn = ${filterQueryFn.toString()}`)
  this._uuid = options.uuid || 'uuid';
  this._updatedAt = options.updatedAt || 'updatedAt';
  this._localPrefix = options.localPrefix || 'off-';
  this._filterQueryFn = options.filterQueryFn || {};

  // We remember the associated service names (on local for each remote)
  this.remoteServiceName = service;
  this.localServiceName = this._localPrefix + service;
  this.localServiceQueue = this._localPrefix + 'queue-' + service;

  // Create the local service and its offline queue
  myapp
    .use(this.localServiceName, ls({ multi: true, name: this.localServiceName, storage: localStorage, id: this._uuid }))
    .use(this.localServiceQueue, ls({ multi: true, name: this.localServiceQueue, storage: localStorage, id: this._uuid }));

  this.localService = myapp.service(this.localServiceName);
  this.localQueue = myapp.service(this.localServiceQueue);
  this.remoteService = myapp.service(this.remoteServiceName);
}

EndpointOffline.prototype.get = function (id, opt) {
  return to( this.localService.get(id, opt) );
}

EndpointOffline.prototype.find = function (query, opt) {
  return to( this.localService.find(query, opt) );
}

EndpointOffline.prototype.create = async function (obj, opt) {
  if (!Array.isArray(obj)) {
    obj = [ obj ];
  }
  let self = this;
  obj.forEach(o => {
    o[self.uuid] = o[self.uuid] || genUuid(true /* short uuid */);
    o[self.updatedAt] = o[self.updatedAt] || new Date();
  });

  let [err, res] = await to( this.localService.create(obj, opt) );
  if (!err) {
    this.localQueue.create({uuid: res[this._uuid], res, op: 'create', updatedAt: res[this._updatedAt]})
      .then(lres => {
        this.remoteService.create(obj, opt)
        .then(rres => {
          this.localQueue.remove(rres[this._uuid])
            .then(lres => {/* do nothing */ return [null, rres]})
            .catch(err => {throw new Error(`Owndata: could not delete item from Queue ${res[this._uuid]}`)})
        })
        .catch(rerr => {
          rerr = rerr.toJSON();
          if (rerr.name === 'Timeout' && rerr.type === 'FeathersError') {
            // Let's silently ignore missing connection to server
            // We'll catch-up next time we get a connection
          }
        });
      })
      .catch(lerr => {
        // We are probably in deep troubles...
        throw new Error(`Owndata: could not write locally to service '${this.localServiceName}'`);
      });
  }
  return Promise.resolve([err, res]);
}
