<#
.SYNOPSIS
    线上冒烟检查（只用 PowerShell 自带的 .NET 类，不依赖 curl）

.DESCRIPTION
    检查的是「每次部署都必须仍然成立」的事实：
      · 首页 200、标题正确
      · SPA 深路径不 404（防 404 的核心）
      · 静态资源 200 且带一年 immutable 缓存
      · index.html 是 no-store（否则微信里会一直看到旧版本）
      · 安全响应头齐全
      · 图标 / manifest / og.png 真的存在

    两个踩过的坑，这里都绕开了：
      1. nginx 的 try_files 兜底会让「不存在的路径」也返回 200 的 index.html，
         所以光看状态码会假绿 → 图标要校验 PNG magic bytes、manifest 要看是不是 JSON。
      2. Windows PowerShell 5.1 与 PowerShell 7 的 Invoke-WebRequest 返回值不一样
         （RawContentStream 在 7 里有差异），所以取内容统一走 .NET WebRequest。

.EXAMPLE
    .\deploy\smoke.ps1
    .\deploy\smoke.ps1 -SiteUrl https://love.ccflysim.cn
#>
[CmdletBinding()]
param(
    [string]$SiteUrl = 'https://love.ccflysim.cn'
)

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$script:failed = 0

function Check($name, $ok, $detail) {
    if ($ok) {
        Write-Host ("  PASS  {0}   [{1}]" -f $name, $detail) -ForegroundColor Green
    } else {
        Write-Host ("  FAIL  {0}   [{1}]" -f $name, $detail) -ForegroundColor Red
        $script:failed++
    }
}

function Get-Status($url, $method = 'Get') {
    try {
        $r = Invoke-WebRequest -Uri $url -Method $method -UseBasicParsing -TimeoutSec 25
        return [int]$r.StatusCode
    } catch {
        if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
        return -1
    }
}

function Get-Headers($url) {
    try {
        return (Invoke-WebRequest -Uri $url -Method Head -UseBasicParsing -TimeoutSec 25).Headers
    } catch {
        return $null
    }
}

# 用 .NET 直接取字节，PS 5.1 / 7 行为一致
function Get-Bytes($url) {
    try {
        $req = [Net.WebRequest]::Create($url)
        $req.Timeout = 25000
        $req.UserAgent = 'love-memoir-smoke'
        $resp = $req.GetResponse()
        $stream = $resp.GetResponseStream()
        $ms = New-Object System.IO.MemoryStream
        $stream.CopyTo($ms)
        $stream.Close()
        $resp.Close()
        return $ms.ToArray()
    } catch {
        return $null
    }
}

function Bytes-Text([byte[]]$bytes) {
    if (-not $bytes) { return '' }
    return [Text.Encoding]::UTF8.GetString($bytes)
}

Write-Host "冒烟检查：$SiteUrl" -ForegroundColor Cyan

# ---------------------------------------------------------------- 状态码
Check '首页 200' ((Get-Status "$SiteUrl/") -eq 200) (Get-Status "$SiteUrl/")

$deep = Get-Status "$SiteUrl/some/deep/path/123"
Check 'SPA 深路径返回 200（防 404）' ($deep -eq 200) $deep

$fav = Get-Status "$SiteUrl/favicon.ico" 'Head'
Check 'favicon 不刷日志' ($fav -eq 204 -or $fav -eq 200) $fav

# ---------------------------------------------------------------- 首页内容
$htmlBytes = Get-Bytes "$SiteUrl/"
$html = Bytes-Text $htmlBytes
Check '首页确实是 HTML' ($htmlBytes -and $htmlBytes.Length -gt 300 -and $html -match '<html') ("$($htmlBytes.Length) bytes")
Check '页面标题正确' ($html -match '我们的恋爱回忆录') 'title'
Check '页面引用了构建产物 assets/index-*.js' ($html -match 'assets/index-[A-Za-z0-9_-]+\.js') 'script'
Check '带了 viewport-fit=cover（安全区才生效）' ($html -match 'viewport-fit=cover') 'meta'
Check '带了 manifest / apple-touch-icon' (($html -match 'manifest\.webmanifest') -and ($html -match 'apple-touch-icon')) 'meta'

# ---------------------------------------------------------------- 缓存策略
$homeHead = Get-Headers "$SiteUrl/"
$cc = if ($homeHead) { ($homeHead['Cache-Control'] -join ',') } else { '' }
Check 'index.html 不缓存（no-store）' ($cc -match 'no-store') $cc

if ($html -match '(assets/index-[A-Za-z0-9_-]+\.js)') {
    $assetPath = $Matches[1]
    $assetStatus = Get-Status "$SiteUrl/$assetPath"
    Check '静态资源 200' ($assetStatus -eq 200) $assetStatus
    $assetHead = Get-Headers "$SiteUrl/$assetPath"
    $assetCC = if ($assetHead) { ($assetHead['Cache-Control'] -join ',') } else { '' }
    Check '静态资源一年 immutable 缓存' ($assetCC -match 'immutable' -and $assetCC -match '31536000') $assetCC
} else {
    Check '静态资源 200' $false '没从 HTML 里解析到 assets 路径'
}

# ---------------------------------------------------------------- 安全头
$csp = if ($homeHead) { ($homeHead['Content-Security-Policy'] -join ' ') } else { '' }
Check '有 CSP（且放行 img-src data: 给照片用）' (($csp -match "default-src 'self'") -and ($csp -match 'data:')) 'CSP'
Check '有 X-Content-Type-Options' ([bool]($homeHead -and $homeHead['X-Content-Type-Options'])) 'nosniff'
Check '有 Referrer-Policy' ([bool]($homeHead -and $homeHead['Referrer-Policy'])) 'referrer'

# ------------------------------------------------- 后端（FastAPI + SQLite）
$healthText = Bytes-Text (Get-Bytes "$SiteUrl/api/health")
Check '后端健康（/api/health 返回 ok:true）' ($healthText -match '"ok":true') ($healthText -replace '\s+', ' ').Trim()
$notFound = Get-Status "$SiteUrl/api/album/notARealAlbumId"
Check '未知 album 返回 404（而不是 SPA 兜底 200）' ($notFound -eq 404) $notFound

# ------------------------------------------------- 新增资源（校验真实内容）
function Test-Png($url) {
    $b = Get-Bytes $url
    return ($b -and $b.Length -gt 1000 -and $b[0] -eq 0x89 -and $b[1] -eq 0x50 -and $b[2] -eq 0x4E -and $b[3] -eq 0x47)
}
Check '图标 512 是真正的 PNG（不是 SPA 兜底）' (Test-Png "$SiteUrl/icons/icon-512.png") 'PNG magic'
Check 'og.png 是真正的 PNG' (Test-Png "$SiteUrl/og.png") 'PNG magic'

$manifestBytes = Get-Bytes "$SiteUrl/manifest.webmanifest"
$manifestText = Bytes-Text $manifestBytes
Check 'manifest 是 JSON（含 name / icons）' ($manifestText -match '"name"' -and $manifestText -match '"icons"') ("$($manifestBytes.Length) bytes")

Write-Host ''
if ($script:failed -eq 0) {
    Write-Host '冒烟检查全部通过' -ForegroundColor Green
    exit 0
} else {
    Write-Host ("冒烟检查有 {0} 项失败" -f $script:failed) -ForegroundColor Red
    exit 1
}
