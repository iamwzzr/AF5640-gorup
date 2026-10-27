import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assetUrl, browserRuntime } from '../src/site.ts';

test('site assets preserve the project path for images, examples and templates', () => {
  assert.equal(assetUrl('/examples/core/holders.csv', '/AF5640-gorup/'), '/AF5640-gorup/examples/core/holders.csv');
  assert.equal(assetUrl('project/core-review.png', '/AF5640-gorup/'), '/AF5640-gorup/project/core-review.png');
  assert.equal(assetUrl('examples/templates/payments.csv', '/AF5640-gorup'), '/AF5640-gorup/examples/templates/payments.csv');
  assert.equal(assetUrl('/examples/manifest.json', '/'), '/examples/manifest.json');
  assert.equal(browserRuntime, false, 'Node tests and local builds retain the HTTP service by default');
});
