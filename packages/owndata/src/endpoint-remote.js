function EndpointRemote (service, options = {}, queryFn = ()=>{}) {
  this.app = myapp;
  this.service = this.app.service(service);
  debug(`EndpointRemote called with:\tservice = ${service}\n\toptions = ${JSON.stringify(options)}\n\tqueryFn = ${queryFn.toString()}`)
}

EndpointRemote.prototype.get = function (id, opt) {
  return to( this.service.get(id, opt) );
}
