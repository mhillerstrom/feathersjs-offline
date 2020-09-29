const debug = require('debug')('@feathersjs-offline:owndata:mutate-store');

const defOptions = {
  sort: (a, b) => {return a - b},
  publication: null,
  subscriber: () => {},
  emitter: null
};

class MutateStore {
  constructor (options = defOptions) {
    this.store = {
      records: [],
      last: {}
    };

    this._sorter = options.sort;
    if (!options.emitter)
      throw new Error(`No emitter set for MutateStore`);

    this.on = options.emitter.on;
    this.emit = options.emitter.emit;

    this._publication = options.publication;
    this._subscriber = options.subscriber;
  }

  mutate (eventName, remoteRecord, source) {
    debug(`mutate started: '${eventName}', remoteRecord ${JSON.stringify(remoteRecord)}, source=${source}`);
    // console.log(`mutate   0: event=${eventName}`);
    const that = this;

    const idName = 'uuid' in remoteRecord ? 'uuid' : ('id' in remoteRecord ? 'id' : '_id');
    const store = this.store;
    const records = store.records;
    let beforeRecord = null;

    const index = this._findIndex(records, record => record[idName] === remoteRecord[idName]);
    // console.log(`mutate   I: index=${JSON.stringify(index)}`);

    if (index > -1) {
      beforeRecord = records[index];
      records.splice(index, 1);
    }

    if (eventName === 'removed') {
      if (index > -1) {
        // console.log(`mutate  IIa: index=${JSON.stringify(index)}`);
        broadcast('remove');
      } else if (source === 0 && (!this._publication || this._publication(remoteRecord))) {
        // Emit service event if it corresponds to a previous optimistic remove
        // console.log(`mutate  IIb: index=${JSON.stringify(index)}`);
        broadcast('remove');
      }

      return beforeRecord; // index >= 0 ? broadcast('remove') : undefined;
    }

    if (this._publication && !this._publication(remoteRecord)) {
      // console.log(`mutate III: index=${JSON.stringify(index)}`);
      return index > -1 ? broadcast('left-pub') : undefined;
    }

//    remoteRecord.updatedAt = new Date();
    records[records.length] = remoteRecord;

    if (this._sorter) {
      records.sort(this._sorter);
    }

    // console.log(`mutate  IV: remoteRecord=${JSON.stringify(remoteRecord)}`);
    broadcast('mutated');

    return remoteRecord;

    function broadcast (action) {
      debug(`emitted ${index} ${eventName} ${action}`);
      // console.log(`broadcast I: index=${index}, action=${action}`);
      store.last = { source, action, eventName, record: remoteRecord };

      that.emit('events', records, store.last);
      // console.log(`broadcast II: index=${index}, action=${action}`);
      that._subscriber(records, store.last);
      // console.log(`broadcast III: index=${index}, action=${action}`);
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

  _findIndexReversed (array, predicate = () => true, fromIndex = Number.POSITIVE_INFINITY) {
    fromIndex = Math.min(fromIndex, array.length - 1);
    for (let i = fromIndex; i > -1; i--) {
      if (predicate(array[i])) {
        return i;
      }
    }

    return -1;
  }
};

export default MutateStore;
