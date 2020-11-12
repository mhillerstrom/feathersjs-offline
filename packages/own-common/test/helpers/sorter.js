module.exports = function sorter ($sort) {
  function getVal (a, sortKeys) {
    let keys = sortKeys.map(key => key);
    let val = a;
    do {
      let key = keys.shift();
      val = val[key];
    } while (keys.length);

    return val;
  };

  const criteria = Object.keys($sort).map(key => {
    const direction = $sort[key];
    const keys = key.split('.');

    return { keys, direction };
  });

  return function (a, b) {
    let compare;

    for (const criterion of criteria) {
      compare = criterion.direction * exports.compare(getVal(a, criterion.keys), getVal(b, criterion.keys));

      if (compare !== 0) {
        return compare;
      }
    }

    return 0;
  };
};
