import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMediaUrl } from './avatar.js';

test('legacy hotel and room uploads use the current API origin',()=>{
  const path='/api/hotels/media/hotel-example.jpg';
  for(const url of [`http://localhost:8080${path}`,`http://127.0.0.1:8080${path}`,`http://hotel-service:8082${path}`,`https://enziurooms.xyz${path}`,path,path.slice(1)])
    assert.equal(resolveMediaUrl(url),path);
  assert.equal(resolveMediaUrl('http://localhost:8080/api/hotels/media/room-example.jpg'),'/api/hotels/media/room-example.jpg');
});
test('external HTTPS photos stay external and invalid sources are rejected',()=>{
  assert.equal(resolveMediaUrl('https://images.example.org/hotel.jpg'),'https://images.example.org/hotel.jpg');
  for(const url of [null,'','   ','javascript:alert(1)','file:///private/hotel.jpg']) assert.equal(resolveMediaUrl(url),null);
});
test('HTTPS pages never load external insecure photos while local uploads remain valid',()=>{
  const previous=globalThis.window;
  globalThis.window={location:{origin:'https://enziurooms.xyz',protocol:'https:'}};
  try {
    assert.equal(resolveMediaUrl('http://external.example.org/hotel.jpg'),null);
    assert.equal(resolveMediaUrl('http://localhost:8080/api/hotels/media/hotel.jpg'),'/api/hotels/media/hotel.jpg');
  } finally { if(previous===undefined) delete globalThis.window; else globalThis.window=previous; }
});
