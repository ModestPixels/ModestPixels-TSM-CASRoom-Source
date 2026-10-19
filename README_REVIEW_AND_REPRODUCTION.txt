MODESTPIXELS CAS ROOM - SOURCE REVIEW KIT
Prepared 19 October 2026 for Nexus Mods security review.
Mod: https://www.nexusmods.com/thesims3/mods/266
File indicated by user: Nexus file ID 695.

WHAT IS SOURCE AND WHAT IS COMPILED
The shipped installer is readable PowerShell source (.ps1), launched by readable
CMD source. No custom Windows EXE, DLL or Sims script assembly is shipped.
The mod package contains model/texture data. The sparse JSON patch includes
compiled Direct3D shader bytecode executed by the game graphics pipeline.
Original EA HLSL source is not available here: the generator clones existing
game shader bytecode and changes one pixel-shader constant from 0.25 to 0.14.
Do not describe this kit as original HLSL source or a compiler build of EA assets.
Shader_Assembly provides before/after disassembly for that exact modification.

Shipped_Setup contains the exact four files from the full 0.1.7 release.
Sources contains the existing shader-patch generator and its local dependencies,
not the original game shader bundle. No npm packages or downloads are required.
The plumbob patch is included as data because one supported room-shader variant
preserves the already-working plumbob shader. Its source parser is imported only;
do not execute adapt_shaders.mjs as a standalone script (its historical CLI has
installation-specific read paths and is not needed for room reproduction).

REPRODUCE THE ROOM SHADER PATCH
Use Node.js 24 (development used 24.19.0) on a working copy of Sources.
1. Obtain your own unmodified supported Sims 3 Shaders_Win32.precomp backup.
   Required SHA256:
   d16ce5d5a5aac7978c91fd9f04fbdc39e979e58743cfde0e53d3accf7d81f981
   Do not copy an already-patched installed shader or overwrite any game file.
2. Inside Sources, create TSMPlumbobDefault/private/release_validation and place
   that backup there with filename Shaders_Win32.precomp.original.
3. Open a terminal in Sources and run:
   node TSMCASRoomDefault/tools/room_shaders.mjs
4. The generated patch is:
   TSMCASRoomDefault/builds/0.1.4/Shader_Setup/ModestPixels_CASRoom_ShaderPatch.json
   Its SHA256 must be:
   2521a23d7e4f410f3a06352c0e549d30dff1383561a19b988fd65e93dd965356
   It must match Shipped_Setup/ModestPixels_CASRoom_ShaderPatch.json byte for byte.
   The script writes staged shader bundles and validation metadata inside Sources;
   it does not install them. Allow roughly 400 MB of local working disk space.
5. Expected generated shader outputs:
   Original_TS3: 296141bc5aebb3ebacf0048631f2c0a08feb869246aebccf13dfcc77b54b8ade
   With_Medieval_Plumbob: a5e9630d56242eb4d7aae7c7120e5a618ad68f9c3aec045e3f9c22aa26efcf5d

INSTALLER REVIEW
No installer compilation step exists. Review the .ps1 file directly. It reads
the selected Game/Bin shader, checks its hash, constructs the sparse patch,
verifies the output, preserves a separate incoming-file backup and replaces
that one shader file. Restore validates its input and returns the backup.
The launchers use -ExecutionPolicy Bypass. These operations are possible warning
triggers, but Nexus has not identified the specific quarantine check yet.
No network calls, credential collection, persistence or antivirus-setting changes
were found in the reviewed installer source. Do not treat that as certification.
The original delivered setup passed 18 local install/restore fixture checks.

NO NESTED ARCHIVE IN THE ORIGINAL DOWNLOAD
The reviewed full release ZIP contains one .package, four setup files, two text
documents and one PNG. No inner ZIP/7z/RAR or password protection was found.
Original locally prepared release ZIP SHA256:
958c6f4e1c2505dd2a0d0d8ec7522b667522c3212fa2fad11ccdc8ad44e35006
Nexus's uploaded file hash has not been obtained, so compare it before assuming
the uploaded archive is identical to the local reviewed release.

PUBLIC SOURCE LINK
This kit has only been prepared locally. No GitHub repository has been created,
no files have been published, and no support email has been sent. If Nexus asks
for a public source URL, publish the kit contents to a source repository and add
that repository URL to the review request. A local file path is not a public URL.
Do not put this source ZIP inside the mod ZIP. Keep the quarantined original
available for moderators while review is pending.
