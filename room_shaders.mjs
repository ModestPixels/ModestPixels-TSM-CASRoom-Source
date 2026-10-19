// Reuse the verified SPKG reader and sparse-patch approach from the plumbob project.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {parseBundle} from '../../TSMPlumbobDefault/tools/adapt_shaders.mjs';
import {fnv} from '../../CottageLife/tools/collection_outfits_lib.mjs';

const root=path.resolve('TSMCASRoomDefault'),read=async p=>JSON.parse((await fs.readFile(p,'utf8')).replace(/^\uFEFF/,''));
const config=await read(path.join(root,'project.json')),style=await read(path.join(root,'room_style.json'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),u=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
const shaderId=parseInt(fnv(style.shader_name),16);
function splice(bytes,operations){let at=0;const parts=[];for(const op of operations){assert(op.offset>=at);parts.push(bytes.subarray(at,op.offset),op.bytes);at=op.offset+op.remove;}parts.push(bytes.subarray(at));return Buffer.concat(parts);}

const plumbobReport=await read('TSMPlumbobDefault/analysis/shader_validation.json');
// The old test staging path may have been cleaned up. Reconstruct the confirmed
// bundle from its preserved public patch into this project's private fixtures.
const plumbobPatch=await read('TSMPlumbobDefault/releases/1.0.0/ModestPixels_SimsMedieval_Plumbob_DefaultReplacement/ModestPixels_MedievalPlumbob_ShaderPatch.json');
const original=await fs.readFile('TSMPlumbobDefault/private/release_validation/Shaders_Win32.precomp.original');
assert.equal(sha(original),plumbobPatch.source_sha256);
const recovered=splice(original,plumbobPatch.operations.map(op=>({offset:op.offset,remove:op.remove_bytes,bytes:Buffer.from(op.data_base64,'base64')})));
assert.equal(sha(recovered),plumbobReport.output_sha256);assert.equal(sha(recovered),plumbobPatch.target_sha256);
await fs.mkdir(path.join(root,'private/shader_sources'),{recursive:true});
const plumbobFixture=path.join(root,'private/shader_sources/MedievalPlumbob.precomp');await fs.writeFile(plumbobFixture,recovered);
const variants=[];
for(const input of [
  {name:'Original_TS3',file:'TSMPlumbobDefault/private/release_validation/Shaders_Win32.precomp.original',sha256:plumbobReport.native_sha256},
  {name:'With_Medieval_Plumbob',file:plumbobFixture,sha256:plumbobReport.output_sha256}
]){
  const source=await fs.readFile(input.file);assert.equal(sha(source),input.sha256);
  const p=parseBundle(source);assert(!p.blocks.some(b=>b.id===shaderId));
  const block=p.blocks.find(b=>b.id===parseInt(style.native_shader,16));assert.equal(block.bytes.length,172);
  assert.equal(block.bytes.toString('ascii',44,48),'PASS');
  const psId=block.bytes.readUInt32LE(60),ps=p.programs[psId-1];assert.equal(ps.tag,'PSHD');
  const constant=Buffer.alloc(4);constant.writeFloatLE(style.native_ambient_floor);
  const offset=ps.code.indexOf(constant);assert(offset>=0);assert.equal(ps.code.indexOf(constant,offset+4),-1,'Exactly one ambient constant');
  const record=Buffer.from(ps.record);record.writeFloatLE(style.ambient_floor,15+offset);
  for(let i=0;i<record.length;i++)if(i<15+offset||i>=19+offset)assert.equal(record[i],ps.record[i]);
  const privateBlock=Buffer.from(block.bytes);privateBlock.writeUInt32LE(shaderId,4);privateBlock.writeUInt32LE(p.programs.length+1,60);
  // Preserve the native FullBright technique, vertex program, constants, samplers and defaults.
  const name=Buffer.from(style.shader_name),nameRecord=Buffer.concat([u(shaderId),u(0),u(name.length),name]);
  const operations=[
    {offset:12,remove:4,bytes:u(source.readUInt32LE(12)+record.length)},
    {offset:20,remove:4,bytes:u(p.programs.length+1)},
    {offset:p.dbuf,remove:0,bytes:record},
    {offset:p.shds+4,remove:4,bytes:u(p.blocks.length+1)},
    {offset:p.blocks.find(b=>b.id>shaderId)?.start??p.knm,remove:0,bytes:privateBlock},
    {offset:p.knm+4,remove:4,bytes:u(source.readUInt32LE(p.knm+4)+nameRecord.length)},
    {offset:p.knm+12,remove:4,bytes:u(p.names.length+1)},
    {offset:source.length-4,remove:0,bytes:nameRecord}
  ].sort((a,b)=>a.offset-b.offset);
  const output=splice(source,operations),q=parseBundle(output);
  assert.equal(q.programs.length,p.programs.length+1);assert.equal(q.blocks.length,p.blocks.length+1);
  p.programs.forEach((s,i)=>assert(s.record.equals(q.programs[i].record),'Original program preserved'));
  const preserved=q.blocks.filter(b=>b.id!==shaderId);p.blocks.forEach((b,i)=>assert(b.bytes.equals(preserved[i].bytes),'Original shader block preserved')); 
  assert(source.subarray(p.dbuf,p.shds).equals(output.subarray(q.dbuf,q.shds)),'Native parameter/default/sampler data preserved');
  assert.deepEqual(q.names.slice(0,p.names.length),p.names);
  const directory=path.join(root,'private/shader_candidates',config.version,input.name);await fs.mkdir(directory,{recursive:true});
  await fs.writeFile(path.join(directory,'Shaders_Win32.precomp'),output);
  variants.push({format:'ModestPixels.SparseBytePatch.1',variant:input.name,source_fixture:input.file,target_fixture:path.relative(root,path.join(directory,'Shaders_Win32.precomp')).replaceAll('\\','/'),source_sha256:sha(source),source_bytes:source.length,target_sha256:sha(output),target_bytes:output.length,original_programs_preserved:p.programs.length,original_blocks_preserved:p.blocks.length,plumbob_preserved:input.name==='With_Medieval_Plumbob',operations:operations.map(op=>({offset:op.offset,remove_bytes:op.remove,data_base64:op.bytes.toString('base64')}))});
  await fs.mkdir(path.join(root,'analysis/room_lighting'),{recursive:true});
  await fs.writeFile(path.join(root,'analysis/room_lighting/Depth_PSHD.cso'),q.programs.at(-1).code);
}
const outputDir=path.join(root,'builds',config.version,'Shader_Setup');await fs.mkdir(outputDir,{recursive:true});
const publicVariants=variants.map(({source_fixture,target_fixture,original_programs_preserved,original_blocks_preserved,plumbob_preserved,...publicData})=>publicData);
await fs.writeFile(path.join(outputDir,'ModestPixels_CASRoom_ShaderPatch.json'),JSON.stringify({format:'ModestPixels.MultiSourceSparsePatch.1',version:config.version,mod:'ModestPixels_SimsMedieval_CASRoom',variants:publicVariants},null,2));
await fs.writeFile(path.join(root,'analysis/room_shader_validation.json'),JSON.stringify({passed:true,version:config.version,private_shader:fnv(style.shader_name),style,original_programs_and_blocks_unchanged:true,only_new_GPU_code_change:'One float in a cloned CASRoom pixel program: ambient floor 0.25 -> '+style.ambient_floor,variants,runtime_tested:false},null,2));
console.log('Private room shader prepared for original TS3 and the confirmed Medieval plumbob bundle; all existing GPU programs/blocks preserved.');
