import errors from '@feathersjs/errors';

/**
 * This sets up a before hook for a given method in a given service. The hook
 * will be triggered once and then it will be removed.
 *
 * @param {string} type Typically 'Remote' or 'Client'
 * @param {string} service The service to be hooked into
 * @param {string} service method to fail install hook for
 */
function failOnceHook (type, serviceName, service, method) {
  let triggered = false;

  service.hooks({
    before: {
      [method]: [async context => {
        if (!triggered) {
          triggered = true;
          throw new errors.GeneralError('Fail requested by user request - simulated general error');
        }
        return context;
      }
      ]
    }
  });
}

module.exports = failOnceHook;
