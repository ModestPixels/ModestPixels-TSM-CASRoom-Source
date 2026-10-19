import assert from 'node:assert/strict';
export const hx=(n,len=8)=>n.toString(16).toUpperCase().padStart(len,'0');
export const fnv=(s,bits=32)=>{let h=bits===64?0xcbf29ce484222325n:0x811c9dc5n;for(const c of Buffer.from(s.toLowerCase()))h=BigInt.asUintN(bits,h*(bits===64?0x100000001b3n:0x1000193n))^BigInt(c);return hx(h,bits/4);};
export const words=(...v)=>{const b=Buffer.alloc(v.length*4);v.forEach((v,i)=>b.writeUInt32LE(v>>>0,i*4));return b;};
export const keyAt=(b,a)=>({type:hx(b.readUInt32LE(a+8)),group:hx(b.readUInt32LE(a+12)),id:hx(b.readBigUInt64LE(a),16)});
export function key(k){const b=Buffer.alloc(16);b.writeBigUInt64LE(BigInt('0x'+k.id));b.writeUInt32LE(parseInt(k.type,16),8);b.writeUInt32LE(parseInt(k.group,16),12);return b;}
export function rcol(b){const n=b.readUInt32LE(16),e=b.readUInt32LE(12);return {header:b.subarray(0,20),chunks:Array.from({length:n},(_,i)=>{const a=20+16*(n+e)+8*i,o=b.readUInt32LE(a),z=b.readUInt32LE(a+4);return {key:keyAt(b,20+16*i),bytes:b.subarray(o,o+z)};}),external:Array.from({length:e},(_,i)=>keyAt(b,20+16*(n+i)))};}
export function encode(r){const h=Buffer.from(r.header);h.writeUInt32LE(r.chunks.length,16);h.writeUInt32LE(r.external.length,12);let off=20+24*r.chunks.length+16*r.external.length;const ix=r.chunks.map(c=>{const b=words(off,c.bytes.length);off+=c.bytes.length;return b;});return Buffer.concat([h,...r.chunks.map(c=>key(c.key)),...r.external.map(key),...ix,...r.chunks.map(c=>c.bytes)]);}
export function resolve(r,ref){const index=(ref&0x0fffffff)-1+(ref>>>28===1?r.header.readUInt32LE(4):0);return r.chunks[index].bytes;}
export function mat(b){assert.equal(b.toString('ascii',0,4),'MATD');const fields={};for(let i=0;i<b.readUInt32LE(40);i++){const a=44+16*i,start=28+b.readUInt32LE(a+12),len=b.readUInt32LE(a+8)*4;fields[hx(b.readUInt32LE(a))]={type:b.readUInt32LE(a+4),data:b.subarray(start,start+len)};}return {shader:hx(b.readUInt32LE(12)),fields};}
export function meshMaterials(r,group){const c=r.chunks.find(c=>c.key.type==='01D10F34'&&parseInt(c.key.group,16)===group);assert(c);const b=c.bytes,refs=[];let p=12;for(let i=0;i<b.readUInt32LE(8);i++){refs.push(b.readUInt32LE(p+8));p+=4+b.readUInt32LE(p);}return refs.map(x=>resolve(r,x));}
export function materialSet(r,b){assert.equal(b.toString('ascii',0,4),'MTST');return Array.from({length:b.readUInt32LE(16)},(_,i)=>{const p=20+12*i;return {name:hx(b.readUInt32LE(p+4)),variant:hx(b.readUInt32LE(p+8)),material:mat(resolve(r,b.readUInt32LE(p)))};});}
export function dst(raw){assert.equal(raw.toString('ascii',0,4),'DDS ');const b=Buffer.from(raw),fmt=raw.toString('ascii',84,88);if(['DXT1','DXT5'].includes(fmt))return b;assert(['DST1','DST5'].includes(fmt));const stride=fmt==='DST1'?8:16,n=(raw.length-128)/stride;assert.equal(n,Math.floor(n));b.write(fmt==='DST1'?'DXT1':'DXT5',84);b.writeUInt32LE(0,24);const planes=fmt==='DST1'?[[0,4,0],[n*4,4,4]]:[[0,2,0],[n*6,6,2],[n*2,4,8],[n*12,4,12]];for(let i=0;i<n;i++)for(const[o,z,t]of planes)raw.copy(b,128+i*stride+t,128+o+i*z,128+o+(i+1)*z);return b;}
export function decodeDDS(raw){
 const b=dst(raw),format=b.toString('ascii',84,88);let at=128,width=b.readUInt32LE(16),height=b.readUInt32LE(12),levels=[];
 const color=c=>[Math.round(((c>>11)&31)*255/31),Math.round(((c>>5)&63)*255/63),Math.round((c&31)*255/31),255];
 for(let m=0;m<Math.max(1,b.readUInt32LE(28));m++){
  const pixels=Buffer.alloc(width*height*4);
  for(let y=0;y<height;y+=4)for(let x=0;x<width;x+=4){
   let alphas=null,alphaBits=0n;
   if(format==='DXT5'){
    alphas=[b[at],b[at+1]];
    if(alphas[0]>alphas[1])for(let i=1;i<=6;i++)alphas.push(Math.floor(((7-i)*alphas[0]+i*alphas[1])/7));
    else{for(let i=1;i<=4;i++)alphas.push(Math.floor(((5-i)*alphas[0]+i*alphas[1])/5));alphas.push(0,255);}
    for(let i=0;i<6;i++)alphaBits|=BigInt(b[at+2+i])<<BigInt(8*i);at+=8;
   }
   const a=b.readUInt16LE(at),c=b.readUInt16LE(at+2),bits=b.readUInt32LE(at+4);at+=8;const p=[color(a),color(c)],opaque=a>c||format==='DXT5';
   p.push(opaque?p[0].map((n,j)=>j===3?255:Math.floor((2*n+p[1][j])/3)):p[0].map((n,j)=>j===3?255:Math.floor((n+p[1][j])/2)));
   p.push(opaque?p[0].map((n,j)=>j===3?255:Math.floor((n+2*p[1][j])/3)):[0,0,0,0]);
   for(let j=0;j<16;j++)if(x+j%4<width&&y+(j>>2)<height){const pixel=[...p[(bits>>>(2*j))&3]];if(alphas)pixel[3]=alphas[Number((alphaBits>>BigInt(3*j))&7n)];pixels.set(pixel,4*((y+(j>>2))*width+x+j%4));}
  }
  levels.push({width,height,pixels});width=Math.max(1,width>>1);height=Math.max(1,height>>1);
 }
 assert.equal(at,b.length,'DDS mip-chain length');return levels;
}
export function compositeDDS(base,overlay){
 const a=decodeDDS(base),b=decodeDDS(overlay);assert(a[0].width===b[0].width&&a[0].height===b[0].height,'Source overlay/base dimensions differ');
 const linear=v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4),srgb=v=>v<=.0031308?v*12.92:1.055*Math.pow(v,1/2.4)-.055;
 let sourceOpaquePixels=0,transparentPixels=0,blendedPixels=0;
 // Preserve original authored mip levels, including original alpha masks. No BC recompression.
 for(let m=0;m<a.length;m++){
  const base=a[m],over=b[Math.min(m,b.length-1)];assert(base.width===over.width&&base.height===over.height,'Source mip mismatch');
  for(let i=0;i<base.pixels.length;i+=4){const alpha=over.pixels[i+3]/255;
   if(alpha===0){if(m===0)transparentPixels++;continue;}
   if(m===0){if(alpha===1)sourceOpaquePixels++;else blendedPixels++;}
   for(let c=0;c<3;c++)base.pixels[i+c]=alpha===1?over.pixels[i+c]:Math.round(255*srgb(linear(base.pixels[i+c]/255)*(1-alpha)+linear(over.pixels[i+c]/255)*alpha));
  }
 }
 const header=Buffer.alloc(128);header.write('DDS ');for(const[at,n]of [[4,124],[8,0x2100F],[12,a[0].height],[16,a[0].width],[20,a[0].width*4],[28,a.length],[76,32],[80,0x41],[88,32],[92,0x00ff0000],[96,0x0000ff00],[100,0x000000ff],[104,0xff000000],[108,0x401008]])header.writeUInt32LE(n>>>0,at);
 const levels=a.map(level=>{const bytes=Buffer.from(level.pixels);for(let i=0;i<bytes.length;i+=4){const r=bytes[i];bytes[i]=bytes[i+2];bytes[i+2]=r;}return bytes;});
 return {bytes:Buffer.concat([header,...levels]),width:a[0].width,height:a[0].height,mips:a.length,sourceOpaquePixels,transparentPixels,blendedPixels,equation:'linear-sRGB RGB = baseRGB*(1-overlayAlpha)+overlayRGB*overlayAlpha; alpha retains original base/mask; opaque/transparent pixels retain decoded source bytes exactly. Native TS4 shader parity remains unverified.'};
}
