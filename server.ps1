$port = 8888
$prefix = "http://localhost:$port/"
$root = "C:\Users\ngokh\OneDrive\Desktop\Smurf"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "SERVER STARTED at $prefix (root: $root)"

$mimeTypes = @{
    '.html' = 'text/html'
    '.css'  = 'text/css'
    '.js'   = 'application/javascript'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.gif'  = 'image/gif'
    '.svg'  = 'image/svg+xml'
    '.json' = 'application/json'
    '.webp' = 'image/webp'
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        # Add CORS headers
        $response.Headers.Add("Access-Control-Allow-Origin", "*")
        $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

        $path = $request.Url.LocalPath
        if ($path -eq "/") { $path = "/test_layering.html" }
        
        $filePath = Join-Path $root ($path -replace '/', '\')
        
        if (Test-Path $filePath) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { 'application/octet-stream' }
            $response.ContentType = $contentType
            
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            Write-Host "200 $path ($contentType)"
        } else {
            $response.StatusCode = 404
            $msg = [System.Text.Encoding]::UTF8.GetBytes("Not Found: $path")
            $response.OutputStream.Write($msg, 0, $msg.Length)
            Write-Host "404 $path"
        }
        $response.Close()
    }
} finally {
    $listener.Stop()
}
