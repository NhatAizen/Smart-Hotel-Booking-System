import test from "node:test";
import assert from "node:assert/strict";
import { fetchDrivingRoute } from "./openStreetMap.js";

test("driving geometry and metrics come from a valid ordered OSRM response", async()=>{
  const original=globalThis.fetch;
  const route={geometry:{type:"LineString",coordinates:[[106.6638,10.8167],[106.6866,10.827]]},distance:4221,duration:721};
  let requested;
  globalThis.fetch=async url=>{requested=url;return {ok:true,json:async()=>({code:"Ok",routes:[route]})};};
  try {
    assert.equal(await fetchDrivingRoute({lat:10.8167,lng:106.6638},{lat:10.827,lng:106.6866}),route);
    assert.ok(requested.includes("driving/106.6638,10.8167;106.6866,10.827?"));
    await fetchDrivingRoute({lat:10.827,lng:106.6866},{lat:10.8167,lng:106.6638});
    assert.ok(requested.includes("driving/106.6866,10.827;106.6638,10.8167?"));
    for(const payload of [{code:"NoRoute"},{code:"Ok",routes:[{...route,duration:null}]},{code:"Ok",routes:[{...route,geometry:{type:"LineString",coordinates:[[999,10],[106,10]]}}]}]){
      globalThis.fetch=async()=>({ok:true,json:async()=>payload});
      await assert.rejects(fetchDrivingRoute({lat:10,lng:106},{lat:11,lng:107}),/Chưa xác nhận/);
    }
    globalThis.fetch=async()=>({ok:false});
    await assert.rejects(fetchDrivingRoute({lat:10,lng:106},{lat:11,lng:107}),/Không thể tính/);
    await assert.rejects(fetchDrivingRoute({lat:NaN,lng:106},{lat:11,lng:107}),/tọa độ/);
  } finally {globalThis.fetch=original;}
});
