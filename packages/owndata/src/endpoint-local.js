function EndpointLocal (service, options = {}, _filterQueryFn = ()=>{}) {
  this.app = myapp;
  this.service = this.app.service(service);
  debug(`EndpointLocal called with:\tservice = ${service}\n\toptions = ${JSON.stringify(options)}\n\t_filterQueryFn = ${_filterQueryFn.toString()}`)
  return this;
}

EndpointLocal.prototype.get = function (id, opt) {
  return to( this.service.get(id, opt) );
}

EndpointLocal.prototype.find = function (query, opt) {
  return to( this.service.find(query, opt) );
}

EndpointLocal.prototype.create = function (obj, opt) {
  return to( this.service.create(obj, opt) );
}
