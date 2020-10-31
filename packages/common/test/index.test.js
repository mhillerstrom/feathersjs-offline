const { expect } = require('chai');
const { to } = require('../src/index');

describe('Owndata:common-test', () => {

  beforeEach(() => {
  });

  it('to() utility', () => {
    it('to() promise success', () => {
      expect(to(Promise.resolve(true))).to.equal([null, true], 'Did not succeeded');
    });
    it('to() promise fail', () => {
      expect(to(Promise.reject(false))).to.equal([false, null], 'Did not fail');
    });
  });

  it('other', () => {
  });

  it('other 2', () => {
  });
});
