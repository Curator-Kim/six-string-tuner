param(
    [string]$JdkPath = $env:JAVA_HOME,
    [string]$AndroidSdkPath = $env:ANDROID_HOME
)
$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
Push-Location $projectPath
try {
    if (-not $JdkPath) { throw 'Set JAVA_HOME to a JDK 21 installation, or pass -JdkPath.' }
    if (-not $AndroidSdkPath) { $AndroidSdkPath = $env:ANDROID_SDK_ROOT }
    if (-not $AndroidSdkPath) { $AndroidSdkPath = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
    if (-not (Test-Path (Join-Path $JdkPath 'bin\java.exe'))) { throw 'JDK executable was not found.' }
    if (-not (Test-Path (Join-Path $JdkPath 'bin\jlink.exe'))) { throw 'A complete JDK 21 with jlink is required.' }
    if (-not (Test-Path (Join-Path $AndroidSdkPath 'platforms\android-35\android.jar'))) { throw 'Android SDK platform 35 is required.' }
    $env:JAVA_HOME = $JdkPath
    $env:ANDROID_HOME = $AndroidSdkPath
    $env:GRADLE_USER_HOME = Join-Path $projectPath '.tools\gradle'
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Web build failed.' }
    & npx.cmd cap sync android
    if ($LASTEXITCODE -ne 0) { throw 'Android sync failed.' }
    $gradleArguments = @('-p', 'android', 'assembleDebug', '--no-daemon')
    $proxySettings = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction SilentlyContinue
    if ($proxySettings.ProxyEnable -eq 1 -and $proxySettings.ProxyServer -match '^([^:;=]+):(\d+)$') {
        $proxyHost = $Matches[1]
        $proxyPort = $Matches[2]
        $gradleArguments += @("-Dhttps.proxyHost=$proxyHost", "-Dhttps.proxyPort=$proxyPort", "-Dhttp.proxyHost=$proxyHost", "-Dhttp.proxyPort=$proxyPort")
    }
    & .\android\gradlew.bat @gradleArguments
    if ($LASTEXITCODE -ne 0) { throw 'APK build failed.' }
    New-Item -ItemType Directory -Path releases -Force | Out-Null
    Copy-Item -LiteralPath 'android\app\build\outputs\apk\debug\app-debug.apk' -Destination 'releases\six-string-tuner-v1.0.0.apk'
    Get-Item 'releases\six-string-tuner-v1.0.0.apk' | Select-Object FullName, Length
    Get-FileHash 'releases\six-string-tuner-v1.0.0.apk' -Algorithm SHA256
} finally { Pop-Location }
