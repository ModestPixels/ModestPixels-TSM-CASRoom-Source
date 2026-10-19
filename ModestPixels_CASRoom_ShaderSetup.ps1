param(
    [ValidateSet('Install','Restore')][string]$Action='Install',
    [string]$GameBin,
    [switch]$NonInteractive
)
$ErrorActionPreference='Stop'
function Get-BytesHash([byte[]]$Bytes) {
    $algorithm=[Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($algorithm.ComputeHash($Bytes)).Replace('-','').ToLowerInvariant() }
    finally { $algorithm.Dispose() }
}
try {
    $catalog=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'ModestPixels_CASRoom_ShaderPatch.json') -Raw | ConvertFrom-Json
    if($catalog.format -ne 'ModestPixels.MultiSourceSparsePatch.1'){throw 'Unsupported shader patch format.'}
    if(!$GameBin){
        if($NonInteractive){throw 'Specify -GameBin with your Sims 3 Game\Bin folder.'}
        $GameBin=Read-Host 'Paste your Sims 3 Game\Bin folder path'
    }
    $GameBin=[Environment]::ExpandEnvironmentVariables($GameBin.Trim().Trim('"'))
    if(Test-Path -LiteralPath $GameBin -PathType Leaf){$GameBin=Split-Path -Parent $GameBin}
    $GameBin=(Resolve-Path -LiteralPath $GameBin).ProviderPath
    $shaderFile=Join-Path $GameBin 'Shaders_Win32.precomp'
    $backupFile=Join-Path $GameBin 'Shaders_Win32.precomp.ModestPixels_CASRoom.original.bak'
    $temporaryFile=Join-Path $GameBin 'Shaders_Win32.precomp.ModestPixels_CASRoom.tmp'
    $current=[IO.File]::ReadAllBytes($shaderFile)
    $currentHash=Get-BytesHash $current
    $matches=@($catalog.variants | Where-Object {$_.source_sha256 -eq $currentHash -or $_.target_sha256 -eq $currentHash})
    if($matches.Count -ne 1){throw 'Unsupported or subsequently modified shader file. Setup preserves it. Supported inputs are the original Sims 3 shader and the confirmed ModestPixels Medieval plumbob shader.'}
    $patch=$matches[0]
    if($patch.format -ne 'ModestPixels.SparseBytePatch.1'){throw 'Unsupported patch variant.'}
    $finished=$false
    if($Action -eq 'Install'){
        if($currentHash -eq $patch.target_sha256){
            Write-Host 'The Medieval CAS room depth shader is already installed. Keep the required .package in Mods.'
            $finished=$true
        } else {
            if($currentHash -ne $patch.source_sha256 -or $current.Length -ne $patch.source_bytes){throw 'This shader file does not match the supported original. No files were changed. A different game version or another shader replacement needs a compatible patch.'}
            $output=[IO.MemoryStream]::new()
            try {
                $position=0
                foreach($operation in $patch.operations){
                    $offset=[int]$operation.offset
                    $remove=[int]$operation.remove_bytes
                    if($offset -lt $position -or $remove -lt 0 -or $offset+$remove -gt $current.Length){throw 'Invalid shader patch range.'}
                    $output.Write($current,$position,$offset-$position)
                    $insert=[Convert]::FromBase64String($operation.data_base64)
                    $output.Write($insert,0,$insert.Length)
                    $position=$offset+$remove
                }
                $output.Write($current,$position,$current.Length-$position)
                $replacement=$output.ToArray()
            } finally { $output.Dispose() }
            if($replacement.Length -ne $patch.target_bytes -or (Get-BytesHash $replacement) -ne $patch.target_sha256){throw 'Shader output verification failed. No files were changed.'}
            if(Test-Path -LiteralPath $backupFile){
                if((Get-BytesHash ([IO.File]::ReadAllBytes($backupFile))) -ne $patch.source_sha256){throw 'An existing ModestPixels backup contains a different file. It was preserved; installation stopped.'}
            } else {
                $backupStream=[IO.File]::Open($backupFile,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
                try {$backupStream.Write($current,0,$current.Length);$backupStream.Flush()}finally{$backupStream.Dispose()}
            }
            $expectedHash=$patch.target_sha256
        }
    } else {
        if($currentHash -eq $patch.source_sha256){
            Write-Host 'The shader from before CAS-room installation is already restored.'
            $finished=$true
        } else {
            if($currentHash -ne $patch.target_sha256){throw 'The shader file has changed since installation. Restore stopped to preserve that file.'}
            if(!(Test-Path -LiteralPath $backupFile)){throw 'The installer backup is missing. Restore your own original shader backup instead.'}
            $replacement=[IO.File]::ReadAllBytes($backupFile)
            if((Get-BytesHash $replacement) -ne $patch.source_sha256){throw 'The backup does not match the supported original. Restore stopped.'}
            $expectedHash=$patch.source_sha256
        }
    }
    if(!$finished){
        $temporaryStream=[IO.File]::Open($temporaryFile,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
        try {$temporaryStream.Write($replacement,0,$replacement.Length);$temporaryStream.Flush()}finally{$temporaryStream.Dispose()}
        if((Get-BytesHash ([IO.File]::ReadAllBytes($temporaryFile))) -ne $expectedHash){throw 'Written shader verification failed; the current shader file was preserved.'}
        [IO.File]::Replace($temporaryFile,$shaderFile,[NullString]::Value)
        if($Action -eq 'Install'){Write-Host 'Medieval CAS room depth shader installed. Add the required ModestPixels .package to Mods.'}
        else {Write-Host 'Previous shader restored, including the plumbob shader if it was present. Remove the CAS-room depth .package from Mods.'}
    }
    if(!$NonInteractive){$null=Read-Host 'Press Enter to close'}
} catch {
    Write-Host ('ERROR: '+$_.Exception.Message) -ForegroundColor Red
    if(!$NonInteractive){$null=Read-Host 'Press Enter to close'}
    exit 1
}
