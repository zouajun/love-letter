param([switch]$NoBrowser)

$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath $PSScriptRoot

function Stop-With-Message {
    param([string[]]$Lines)
    Write-Host ""
    foreach ($l in $Lines) { Write-Host $l }
    Write-Host ""
    Read-Host "按回车键关闭"
    exit 1
}

# ---------- 1. 找一个能用的 Python ----------
$candidates = @()
if (Get-Command py -ErrorAction SilentlyContinue) { $candidates += , @('py', '-3') }
if (Get-Command python -ErrorAction SilentlyContinue) { $candidates += , @('python') }
if (Test-Path -LiteralPath 'C:\Python314\python.exe') { $candidates += , @('C:\Python314\python.exe') }
$glob = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python3*\python.exe'
Get-ChildItem -Path $glob -ErrorAction SilentlyContinue | ForEach-Object { $candidates += , @($_.FullName) }

$python = $null
$version = $null
foreach ($c in $candidates) {
    $exe = $c[0]
    $rest = @()
    if ($c.Count -gt 1) { $rest = $c[1..($c.Count - 1)] }
    try {
        $out = & $exe @rest -c "import sys;print(sys.version.split()[0])" 2>$null
        if ($LASTEXITCODE -eq 0 -and $out) {
            $python = $exe
            $pyArgs = $rest
            $version = ($out | Select-Object -First 1)
            break
        }
    }
    catch { }
}

if (-not $python) {
    Stop-With-Message @(
        "  [x] 没有找到可以用的 Python。",
        "",
        "      请到 https://www.python.org/downloads/ 安装 Python 3，",
        "      安装时记得勾选「Add python.exe to PATH」，装完重新双击 preview.bat。",
        "",
        "      如果你习惯用 Node，也可以在这个目录里执行： npx serve ."
    )
}

# ---------- 2. 找一个没被占用的端口 ----------
function Test-PortFree {
    param([int]$Port)
    $listener = $null
    try {
        $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
        $listener.Start()
        return $true
    }
    catch { return $false }
    finally { if ($listener) { try { $listener.Stop() } catch { } } }
}

$port = $null
foreach ($p in 8000..8010) {
    if (Test-PortFree $p) { $port = $p; break }
}
if (-not $port) {
    Stop-With-Message @(
        "  [x] 8000-8010 端口都被占用了。",
        "      先关掉占用端口的程序（或在任务管理器里结束多余的 python 进程）再试。"
    )
}

$url = "http://127.0.0.1:$port/"

Write-Host ""
Write-Host "  程序员的情书 · 本地预览" -ForegroundColor Magenta
Write-Host ""
Write-Host "  目录 : $PWD"
Write-Host "  Python : $python $($pyArgs -join ' ') (v$version)"
Write-Host "  地址 : $url" -ForegroundColor Cyan
Write-Host "  停止 : 关掉这个窗口，或者按 Ctrl+C"
Write-Host ""
Write-Host "  提示：如果浏览器没有自动打开，把上面的地址复制到浏览器里就行。" -ForegroundColor DarkGray
Write-Host ""

if (-not $NoBrowser) {
    try { Start-Process $url } catch { }
}

& $python @pyArgs -m http.server $port --bind 127.0.0.1
