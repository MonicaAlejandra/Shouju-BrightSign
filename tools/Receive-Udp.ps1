param(
  [ValidateRange(1, 65535)]
  [int]$Port = 5000
)

$endpoint = [System.Net.IPEndPoint]::new([System.Net.IPAddress]::Any, $Port)
$listener = [System.Net.Sockets.UdpClient]::new($endpoint)

Write-Host "Listening for UDP packets on port $Port. Press Ctrl+C to stop."

try {
  while ($true) {
    $packet = $listener.Receive([ref]$endpoint)
    $message = [System.Text.Encoding]::UTF8.GetString($packet)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff"
    Write-Host "[$timestamp] $($endpoint.Address):$($endpoint.Port)  $message"
  }
}
finally {
  $listener.Dispose()
}
