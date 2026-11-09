import test from 'node:test';
import assert from 'node:assert/strict';
import { availabilityMatches, roomQuoteEvidence, declaredAmenities } from './groundedEvidence.js';

const trip={checkIn:'2026-11-01',checkOut:'2026-11-03'};
test('availability is evidence only for the requested hotel AND stay',()=>{
  const valid={hotelId:'a',...trip,unavailableRoomIds:[]};
  assert.equal(availabilityMatches(valid,'a',trip),true);
  for(const data of [null,{...valid,hotelId:'b'},{...valid,checkIn:'2026-11-02'},{...valid,checkOut:'2026-11-04'},{...valid,unavailableRoomIds:null},{...valid,unavailableRoomIds:[null]}])
    assert.equal(availabilityMatches(data,'a',trip),false);
});
test('pricing never borrows another room price or a multi-room aggregate',()=>{
  const evidence=quote=>roomQuoteEvidence({hotelId:'a',...trip,...quote,rooms:quote.rooms?.map(room=>({roomId:'room-a',...room}))},'chosen','a',trip,'room-a');
  assert.equal(evidence({rooms:[{roomTypeId:'other',totalAmount:1}]}),null);
  assert.equal(evidence({totalAmount:100,rooms:[{roomTypeId:'chosen'},{roomTypeId:'other'}]}),null);
  const valid=evidence({totalAmount:999,rooms:[{roomTypeId:'other',totalAmount:1},{roomTypeId:'chosen',totalAmount:700000}]});
  assert.equal(valid.totalAmount,700000);
  for(const amount of [-1,'bad',Infinity,null]) assert.equal(evidence({rooms:[{roomTypeId:'chosen',totalAmount:amount}]}),null);
  assert.equal(evidence({hotelId:'b',rooms:[{roomTypeId:'chosen',totalAmount:100}]}),null);
  assert.equal(evidence({checkIn:'2026-11-02',rooms:[{roomTypeId:'chosen',totalAmount:100}]}),null);
  assert.equal(evidence({rooms:[{roomId:'room-b',roomTypeId:'chosen',totalAmount:1}]}),null);
});
test('marketing prose, room names and match explanations never prove an amenity',()=>{
  assert.deepEqual(declaredAmenities({description:'Không có hồ bơi',roomTypeName:'Pool Suite',matchReasons:['Hồ bơi gần khách sạn'],amenities:['WiFi'],breakfastIncluded:null}),['WiFi']);
  assert.deepEqual(declaredAmenities({amenities:['WiFi'],roomAmenities:['Điều hòa'],breakfastIncluded:true}),['WiFi','Điều hòa','Bữa sáng']);
});
