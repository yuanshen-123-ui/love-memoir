<#
.SYNOPSIS
    一键部署 love-memoir 后端（FastAPI + SQLite）

.DESCRIPTION
    1. 打包 backend/（不含 .venv / data / 已上传的图片 / 测试）
    2. scp 到服务器 /tmp
    3. 远端执行 install.sh：venv、依赖、.env、systemd、nginx 反代、自检

    幂等：重复跑只会升级代码并重启服务，.env 和数据不会被动。

.EXAMPLE
    .\backend\deploy\deploy-backend.ps1
#>
[CmdletBinding()]
param(
    [string]$SshTarget = 'root@YOUR_SERVER_IP'
)

$ErrorActionPreference = 'Stop'
# $PSScriptRoot = <repo>\backend\deploy
$backend = Split-Path -Parent $PSScriptRoot
$tarball = Join-Path $env:TEMP 'love-api.tgz'

function Step($n, $text) { Write-Host ("[{0}/3] {1}" -f $n, $text) -ForegroundColor Cyan }

Push-Location $backend
try {
    Step 1 '打包（排除 .venv / data / 上传的图片 / 测试）'
    if (Test-Path $tarball) { Remove-Item $tarball -Force }
    tar -czf $tarball `
        --exclude=.venv `
        --exclude=data `
        --exclude=tests `
        --exclude=__pycache__ `
        --exclude=.pytest_cache `
        --exclude=static/uploads `
        -C $backend .
    if ($LASTEXITCODE -ne 0) { throw 'tar 打包失败' }
    $kb = [math]::Round((Get-Item $tarball).Length / 1KB, 1)
    Write-Host ("       {0}  ({1} KB)" -f $tarball, $kb) -ForegroundColor DarkGray

    Step 2 "上传到 $SshTarget"
    scp $tarball "${SshTarget}:/tmp/love-api.tgz"
    if ($LASTEXITCODE -ne 0) { throw 'scp 上传代码失败' }
    scp (Join-Path $PSScriptRoot 'install.sh') "${SshTarget}:/tmp/love-api-install.sh"
    if ($LASTEXITCODE -ne 0) { throw 'scp install.sh 失败' }

    Step 3 '远端安装（venv + 依赖 + systemd + nginx 反代 + 自检）'
    # Windows 上的 .sh 可能是 CRLF，先转成 LF 再执行，否则 bash 会报 $'\r': command not found
    ssh $SshTarget 'sed -i "s/\r$//" /tmp/love-api-install.sh; bash /tmp/love-api-install.sh /tmp/love-api.tgz'
    if ($LASTEXITCODE -ne 0) { throw '远端安装失败，看上面的输出' }

    Write-Host "`n后端部署完成：https://love.ccflysim.cn/api/health" -ForegroundColor Green
} finally {
    Pop-Location
}
