// Per-primitive bounding boxes (node name, material, x/y/z min..max) of catalogue GLBs.
//   node _glbparts.mjs <catalog-id> [<catalog-id> ...]
// The repo is four directories above this file (or REPO=<dir>).
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(process.env.REPO || join(dirname(fileURLToPath(import.meta.url)), "../../../.."));
const cat = JSON.parse(readFileSync(root + "/public/models/furniture/catalog.json", "utf8"));
const want = process.argv.slice(2);
function trs(n){ if(n.matrix) return n.matrix; const [tx,ty,tz]=n.translation??[0,0,0]; const [qx,qy,qz,qw]=n.rotation??[0,0,0,1]; const [sx,sy,sz]=n.scale??[1,1,1];
 const xx=qx*qx,yy=qy*qy,zz=qz*qz,xy=qx*qy,xz=qx*qz,yz=qy*qz,wx=qw*qx,wy=qw*qy,wz=qw*qz;
 return [(1-2*(yy+zz))*sx,2*(xy+wz)*sx,2*(xz-wy)*sx,0,2*(xy-wz)*sy,(1-2*(xx+zz))*sy,2*(yz+wx)*sy,0,2*(xz+wy)*sz,2*(yz-wx)*sz,(1-2*(xx+yy))*sz,0,tx,ty,tz,1]; }
function mul(a,b){const o=new Array(16).fill(0);for(let i=0;i<4;i++)for(let j=0;j<4;j++)for(let k=0;k<4;k++)o[j*4+i]+=a[k*4+i]*b[j*4+k];return o;}
for (const id of want) {
  const it = cat.items.find(i=>i.id===id); if (!it) { console.log(id, "not in the catalogue"); continue; } const buf = readFileSync(root+"/public"+it.url);
  const g = JSON.parse(buf.slice(20,20+buf.readUInt32LE(12)).toString());
  const visit=(ni,P)=>{const n=g.nodes[ni];const m=mul(P,trs(n));
    if(n.mesh!=null){for(const [pi,prim] of g.meshes[n.mesh].primitives.entries()){const a=g.accessors[prim.attributes.POSITION];const mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
      for(let c=0;c<8;c++){const v=[c&1?a.max[0]:a.min[0],c&2?a.max[1]:a.min[1],c&4?a.max[2]:a.min[2]];const w=[0,1,2].map(i=>m[i]*v[0]+m[4+i]*v[1]+m[8+i]*v[2]+m[12+i]);for(let i=0;i<3;i++){mn[i]=Math.min(mn[i],w[i]);mx[i]=Math.max(mx[i],w[i]);}}
      const mat = prim.material!=null ? g.materials[prim.material].name : "";
      console.log(id, (n.name||"").padEnd(22), mat.padEnd(18), "x",mn[0].toFixed(3),mx[0].toFixed(3),"y",mn[1].toFixed(3),mx[1].toFixed(3),"z",mn[2].toFixed(3),mx[2].toFixed(3));}}
    for(const c of n.children??[]) visit(c,m);};
  for(const ni of g.scenes[g.scene??0].nodes) visit(ni,[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
}
