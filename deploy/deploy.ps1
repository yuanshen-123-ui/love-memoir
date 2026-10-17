<#
.SYNOPSIS
    一键部署「我们的恋爱回忆录」到 love.ccflysim.cn

.DESCRIPTION
    纯静态站，没有构建后端。流程：
      1. npm run build
      2. 把 dist 打成 tar.gz（比 scp -r 一堆小文件快很多）
      3. scp 到服务器 /tmp
      4. 远端解包到 /var/www/love.ccflysim.cn（只替换 assets 与 index.html）
      5. 跑一遍冒烟检查

    为什么不需要 reload nginx：nginx 直接读磁盘文件，
    assets 文件名带内容哈希、index.html 是 no-store，换完立刻生效。

.EXAMPLE
    .\deploy\deploy.ps1
    .\deploy\deploy.ps1 -SkipBuild          # dist 已经是新的，只上传
    .\deploy\deploy.ps1 -SkipSmoke          # 不跑冒烟
#>
[CmdletBinding()]
param(
    [string]$SshTarget = 'root@YOUR_SERVER_IP',
    [string]$WebRoot = '/var/www/love.ccflysim.cn',
    [string]$SiteUrl = 'https://love.ccflysim.cn',
    [switch]$SkipBuild,
    [switch]$SkipSmoke
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$tarball = Join-Path $env:TEMP 'love-dist.tgz'

function Step($n, $text) {
    Write-Host ("[{0}/5] {1}" -f $n, $text) -ForegroundColor Cyan
}

Push-Location $root
try {
    # ---------------------------------------------------------------- 构建
    if (-not $SkipBuild) {
        Step 1 '构建（npm run build）'
        npm run build
        if ($LASTEXITCODE -ne 0) { throw '构建失败，已中止部署' }
    } else {
        Step 1 '跳过构建（-SkipBuild）'
    }

    if (-not (Test-Path (Join-Path $root 'dist\index.html'))) {
        throw 'dist\index.html 不存在，先跑一次不带 -SkipBuild 的部署'
    }

    # ---------------------------------------------------------------- 打包
    Step 2 '打包 dist'
    if (Test-Path $tarball) { Remove-Item $tarball -Force }
    tar -czf $tarball -C (Join-Path $root 'dist') .
    if ($LASTEXITCODE -ne 0) { throw 'tar 打包失败' }
    $sizeKB = [math]::Round((Get-Item $tarball).Length / 1KB, 1)
    Write-Host ("       {0}  ({1} KB)" -f $tarball, $sizeKB) -ForegroundColor DarkGray

    # ---------------------------------------------------------------- 上传
    Step 3 "上传到 $SshTarget"
    scp $tarball "${SshTarget}:/tmp/love-dist.tgz"
    if ($LASTEXITCODE -ne 0) { throw 'scp 上传失败' }
    scp (Join-Path $PSScriptRoot 'remote-extract.sh') "${SshTarget}:/tmp/love-remote-extract.sh"
    if ($LASTEXITCODE -ne 0) { throw 'scp 上传脚本失败' }

    # ---------------------------------------------------------- 远端解包
    Step 4 "远端解包到 $WebRoot"
    ssh $SshTarget "bash /tmp/love-remote-extract.sh $WebRoot /tmp/love-dist.tgz"
    if ($LASTEXITCODE -ne 0) { throw '远端解包失败' }

    # ---------------------------------------------------------------- 冒烟
    if ($SkipSmoke) {
        Step 5 '跳过冒烟检查（-SkipSmoke）'
    } else {
        Step 5 '冒烟检查'
        & (Join-Path $PSScriptRoot 'smoke.ps1') -SiteUrl $SiteUrl
        if ($LASTEXITCODE -ne 0) { throw '冒烟检查未全部通过，请查看上面的输出' }
    }

    Write-Host "`n部署完成：$SiteUrl" -ForegroundColor Green
} finally {
    Pop-Location
}
