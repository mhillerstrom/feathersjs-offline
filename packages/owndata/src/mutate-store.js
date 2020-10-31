const debug = require('debug')('@feathersjs-offline:owndata:mutate-store');

const defOptions = {
  sort: (a, b) => {return a - b},
  publication: null,
  subscriber: () => {},
  emitter: null
};

class MutateStore {
  constructor (opt = defOptions) {
    let options = Object.assign({}, opt, defOptions);
    debug(`******  options = ${JSON.stringify(options)}`);
    this.store = {
      records: [],
      last: {}
    };

    this._sorter = options.sort;
    if (!options.emit)
      throw new Error(`No emitter set for MutateStore`);

    this.emit = options.emit;

    this._publication = options.publication;
    this._subscriber = options.subscriber;

    this._id = options.id;
  }

  mutate (eventName, remoteRecord, source) {
    debug(`mutate started: '${eventName}', remoteRecord ${JSON.stringify(remoteRecord)}, source=${source}`);
    const that = this;

    const idName = this._id;
    const store = this.store;
    const records = store.records;
    let beforeRecord = null;

    debug(`  _findIndex(${JSON.stringify(records)}), remoteRecord[${idName}] = ${remoteRecord[idName]}`)
    const index = this._findIndex(records, record => {return record[idName] === remoteRecord[idName]});

    if (index > -1) {
      beforeRecord = records[index];
      records.splice(index, 1);
    }

    if (eventName === 'removed') {
      if (index > -1) {
        broadcast('remove');
      } else if (source === 0 && (!this._publication || this._publication(remoteRecord))) {
        // Emit service event if it corresponds to a previous optimistic remove
        broadcast('remove');
      }

      return beforeRecord; // index >= 0 ? broadcast('remove') : undefined;
    }

    if (this._publication && !this._publication(remoteRecord)) {
      return index > -1 ? broadcast('left-pub') : undefined;
    }

    records[records.length] = remoteRecord;

    if (this._sorter) {
      records.sort(this._sorter);
    }

    broadcast('mutated');

    return remoteRecord;

    function broadcast (action) {
      debug(`emitted ${index} ${eventName} ${action}`);
      store.last = { source, action, eventName, record: remoteRecord };

      that.emit('events', records, store.last);
      that._subscriber(records, store.last);
    }
  }

  changeSort (sort) {
    this._sorter = sort;

    if (this._sorter) {
      this.store.records.sort(this._sorter);
    }

    this.emit('events', this.store.records, { action: 'change-sort' });
    this._subscriber(this.store.records, { action: 'change-sort' });
  }

  _findIndex (array, predicate = () => true, fromIndex = 0) {
    for (let i = fromIndex, len = array.length; i < len; i++) {
      if (predicate(array[i])) {
        return i;
      }
    }

    return -1;
  }
};

export default MutateStore;
