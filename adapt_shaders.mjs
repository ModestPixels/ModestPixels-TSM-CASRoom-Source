// Narrow SPKG adapter: retain all native data; append two donor shader programs,
// required sampler states, one private SBLK, and its diagnostic name.
// Package/RCOL handling remains in the established shared libraries.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fnv} from '../../CottageLife/tools/collection_outfits_lib.mjs';
const root=path.resolve('TSMPlumbobDefault'),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),u=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
export function parseBundle(b){
 assert.equal(b.toString('ascii',0,4),'SPKG');assert([1,2].includes(b.readUInt32LE(4)));
 assert.equal(b.toString('ascii',8,12),'SHDB');assert.equal(b.toString('ascii',16,20),'LINK');
 const programs=[];let p=24;for(let i=0;i<b.readUInt32LE(20);i++){const bytes=b.readUInt32LE(p+11),tag=b.toString('ascii',p+7,p+11);assert(['VSHD','PSHD'].includes(tag));assert.equal(b.readUInt32LE(p+3),bytes+8);assert.equal(b.readUInt16LE(p+17),tag==='VSHD'?0xfffe:0xffff);programs.push({id:i+1,tag,start:p,end:p+15+bytes,code:b.subarray(p+15,p+15+bytes),record:b.subarray(p,p+15+bytes)});p+=15+bytes;}
 const dbuf=p;assert.equal(b.toString('ascii',p,p+4),'DBUF');p+=8+4*b.readUInt32LE(p+4);assert.equal(p,16+b.readUInt32LE(12));assert.equal(b.toString('ascii',p,p+4),'SMDB');p+=4;assert.equal(b.toString('ascii',p,p+4),'SMPS');const smps=p,states=[];p+=8;for(let i=0;i<b.readUInt32LE(smps+4);i++){let bytes=b.readUInt32LE(p);assert(bytes%8===0);states.push({start:p,bytes:b.subarray(p+4,p+4+bytes),record:b.subarray(p,p+4+bytes)});p+=4+bytes;}const smpsEnd=p;
 const shds=b.indexOf('SHDS',p);assert(shds>p);const blocks=[];p=shds+8;for(let i=0;i<b.readUInt32LE(shds+4);i++){assert.equal(b.toString('ascii',p,p+4),'SBLK');const end=p+16+b.readUInt32LE(p+12);assert(end<=b.length);blocks.push({id:b.readUInt32LE(p+4),start:p,end,bytes:b.subarray(p,end)});p=end;}
 assert(blocks.every((x,i)=>!i||x.id>=blocks[i-1].id));const knm=p;assert.equal(b.toString('ascii',p,p+4),'KNM ');assert.equal(knm+8+b.readUInt32LE(knm+4)+4,b.length);assert.equal(b.toString('ascii',b.length-4),'END ');assert.equal(b.readUInt32LE(knm+8),1);
 p=knm+16;const names=[];for(let i=0;i<b.readUInt32LE(knm+12);i++){const len=b.readUInt32LE(p+8);names.push({id:b.readUInt32LE(p),flags:b.readUInt32LE(p+4),name:b.toString('utf8',p+12,p+12+len)});p+=12+len;}assert.equal(p,b.length-4);
 return{programs,dbuf,smps,smpsEnd,states,shds,blocks,knm,names};
}
export function adaptBundle(native,donor){
 const a=parseBundle(native),b=parseBundle(donor),id=parseInt(fnv('ModestPixels.TSMPlumbobDefault.Plumbob'),16);
 const n=a.blocks.find(x=>x.id===0xdef16564),d=b.blocks.find(x=>x.id===0xdef16564);assert(n&&d);assert.equal(n.bytes.length,288);assert.equal(d.bytes.length,304);assert(!a.blocks.some(x=>x.id===id));
 // Both source bindings use precisely the same constants/register metadata.
 for(const [start,end] of [[16,36],[40,56],[72,152],[160,264]])assert(n.bytes.subarray(start,end).equals(d.bytes.subarray(start,end)),'Cross-engine binding contract mismatch '+start);
 const block=Buffer.from(d.bytes);block.writeUInt32LE(id,4);block.writeUInt32LE(id,36);
 const newPrograms=[b.programs[d.bytes.readUInt32LE(56)-1],b.programs[d.bytes.readUInt32LE(60)-1]];assert.deepEqual(newPrograms.map(x=>x.tag),['VSHD','PSHD']);
 block.writeUInt32LE(a.programs.length+1,56);block.writeUInt32LE(a.programs.length+2,60);
 // Keep native default-buffer indices, not TSM's.
 for(const pos of [68,156])block.writeUInt32LE(n.bytes.readUInt32LE(pos),pos);
 const addedStates=[],samplerMappings=[];assert.equal(block.readUInt32LE(264),15);
 for(let i=0;i<4;i++){const pos=268+8*i,old=block.readUInt32LE(pos),state=b.states[old];assert(state);let ni=a.states.findIndex(x=>x.bytes.equals(state.bytes));if(ni<0){let ai=addedStates.findIndex(x=>x.bytes.equals(state.bytes));if(ai<0){ai=addedStates.length;addedStates.push(state);}ni=a.states.length+ai;}block.writeUInt32LE(ni,pos);samplerMappings.push({slot:i,source_state:old,target_state:ni,field:block.readUInt32LE(pos+4).toString(16).toUpperCase()});}
 // Donor typo DiffuseTexureMap is not declared by TS3. Bind standard DiffuseMap,
 // whose payload is byte-identical in the donor material.
 assert.equal(block.readUInt32LE(288),0xa080ecbc);block.writeUInt32LE(0x6cc0fd85,288);samplerMappings[2].field='6CC0FD85';
 const insertBlock=a.blocks.find(x=>x.id>id)?.start??a.knm;
 const name=Buffer.from('ModestPixels.TSMPlumbobDefault.Plumbob'),nameRecord=Buffer.concat([u(id),u(0),u(name.length),name]);
 const edits=[
 {start:12,end:16,bytes:u(native.readUInt32LE(12)+newPrograms.reduce((s,x)=>s+x.record.length,0))},
 {start:20,end:24,bytes:u(a.programs.length+2)},
 {start:a.dbuf,end:a.dbuf,bytes:Buffer.concat(newPrograms.map(x=>x.record))},
 {start:a.smps+4,end:a.smps+8,bytes:u(a.states.length+addedStates.length)},
 {start:a.smpsEnd,end:a.smpsEnd,bytes:Buffer.concat(addedStates.map(x=>x.record))},
 {start:a.shds+4,end:a.shds+8,bytes:u(a.blocks.length+1)},
 {start:insertBlock,end:insertBlock,bytes:block},
 {start:a.knm+4,end:a.knm+8,bytes:u(native.readUInt32LE(a.knm+4)+nameRecord.length)},
 {start:a.knm+12,end:a.knm+16,bytes:u(a.names.length+1)},
 {start:native.length-4,end:native.length-4,bytes:nameRecord},
 ].sort((x,y)=>x.start-y.start);
 let p=0;const parts=[];for(const e of edits){assert(e.start>=p);parts.push(native.subarray(p,e.start),e.bytes);p=e.end;}parts.push(native.subarray(p));const output=Buffer.concat(parts),v=parseBundle(output);
 assert.equal(v.programs.length,a.programs.length+2);assert.equal(v.blocks.length,a.blocks.length+1);
 for(let i=0;i<a.programs.length;i++)assert(a.programs[i].record.equals(v.programs[i].record),'Original shader changed');
 const originalBlocks=v.blocks.filter(x=>x.id!==id);for(let i=0;i<a.blocks.length;i++)assert(a.blocks[i].bytes.equals(originalBlocks[i].bytes),'Original material shader changed');
 assert(native.subarray(a.dbuf,a.smps).equals(output.subarray(v.dbuf,v.smps)),'Native parameter data changed');
 assert(native.subarray(a.smpsEnd,a.shds).equals(output.subarray(v.smpsEnd,v.shds)),'Native parameter declarations changed');
 for(let i=0;i<a.states.length;i++)assert(a.states[i].bytes.equals(v.states[i].bytes));
 assert.deepEqual(v.names.slice(0,a.names.length),a.names);
 return{output,report:{private_shader_id:id.toString(16).toUpperCase(),native_sha256:sha(native),donor_sha256:sha(donor),output_sha256:sha(output),original_programs_preserved:a.programs.length,original_shader_blocks_preserved:a.blocks.length,original_sampler_states_preserved:a.states.length,added_programs:newPrograms.map(x=>({source_id:x.id,type:x.tag,bytes:x.code.length,sha256:sha(x.code)})),samplerMappings,added_sampler_states:addedStates.length,original_parameter_data_preserved:true,bindings:'TS3 default buffer offsets; identical vertex/pixel constant registers; TSM texture sampler states remapped by bytes; standard DiffuseMap field.'},programs:newPrograms};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'))){
 const nativePath='F:/Program Files (x86)/Electronic Arts/The Sims 3 Complete Collection/Game/Bin/Shaders_Win32.precomp',donorPath='F:/Program Files/EA Games/The Sims Medieval/Game/Bin/Shaders_Win32.precomp';
 const native=await fs.readFile(nativePath),donor=await fs.readFile(donorPath),r=adaptBundle(native,donor);
 await fs.mkdir(path.join(root,'builds/0.1.0/GameBin'),{recursive:true});await fs.mkdir(path.join(root,'sources/shaders'),{recursive:true});
 await fs.writeFile(path.join(root,'builds/0.1.0/GameBin/Shaders_Win32.precomp'),r.output);
 for(const p of r.programs)await fs.writeFile(path.join(root,'sources/shaders/'+p.tag+'.cso'),p.code);
 await fs.writeFile(path.join(root,'analysis/shader_validation.json'),JSON.stringify({...r.report,native_path:nativePath,donor_path:donorPath,runtime_tested:false},null,2));
 console.log(JSON.stringify(r.report,null,2));
}

