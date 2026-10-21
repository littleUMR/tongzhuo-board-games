// Adapted from lolPing src/shared/geometry.ts, MIT, Copyright (c) 2026 Danrui Meng.
// Original source, pinned commit and full license are included in this directory.
(function(root){
 function pickSlice(dx,dy,deadZone=24){
  if(Math.hypot(dx,dy)<deadZone)return -1;
  const deg=((Math.atan2(dy,dx)*180)/Math.PI+90+22.5+360)%360;
  return Math.floor(deg/45)%8;
 }
 if(typeof module==='object')module.exports={pickSlice};else root.TableWheelGeometry={pickSlice};
})(typeof window==='object'?window:globalThis);
