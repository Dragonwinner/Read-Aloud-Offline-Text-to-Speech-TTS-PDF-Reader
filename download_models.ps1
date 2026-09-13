$voicesDir = "F:\TEACH\system design\alisha\voices"
if (!(Test-Path $voicesDir)) { 
    New-Item -ItemType Directory -Path $voicesDir -Force | Out-Null 
}

Write-Host "1/4 Downloading Amy female voice model..."
curl.exe -L --retry 5 --retry-delay 2 "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/amy/medium/en_US-amy-medium.onnx" -o "$voicesDir\en_US-amy-medium.onnx"

Write-Host "2/4 Downloading Amy config..."
curl.exe -L --retry 5 --retry-delay 2 "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/amy/medium/en_US-amy-medium.onnx.json" -o "$voicesDir\en_US-amy-medium.onnx.json"

Write-Host "3/4 Downloading Ryan male voice model..."
curl.exe -L --retry 5 --retry-delay 2 "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ryan/medium/en_US-ryan-medium.onnx" -o "$voicesDir\en_US-ryan-medium.onnx"

Write-Host "4/4 Downloading Ryan config..."
curl.exe -L --retry 5 --retry-delay 2 "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ryan/medium/en_US-ryan-medium.onnx.json" -o "$voicesDir\en_US-ryan-medium.onnx.json"

Write-Host "SUCCESS: All voice models downloaded successfully."
