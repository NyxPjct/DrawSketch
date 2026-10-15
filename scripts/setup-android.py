#!/usr/bin/env python3
"""Install verified public Android tools and a JDK into workspace-local caches."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile
import urllib.parse
import zipfile
from xml.etree import ElementTree as ET

cache = Path(os.environ.get('DRAWSKETCH_NATIVE_CACHE', '/workspace/.cache/drawsketch-native'))
cache.mkdir(parents=True, exist_ok=True)
sdk = cache / 'android-sdk'
jdk = cache / 'jdk-21'

def fetch(url, output):
    subprocess.run(['curl', '--fail', '--location', '--silent', '--show-error', '--retry', '2', '--max-time', '240', url, '-o', str(output)], check=True)

def verify(path, expected, algorithm):
    actual = hashlib.new(algorithm, path.read_bytes()).hexdigest()
    if actual.lower() != expected.strip().lower():
        raise RuntimeError(f'Checksum mismatch for {path.name}')

if not (jdk / 'bin/javac').exists():
    url = subprocess.check_output(['curl', '--fail', '--location', '--silent', '--show-error', '--output', '/dev/null', '--write-out', '%{url_effective}', 'https://github.com/adoptium/temurin21-binaries/releases/latest'], text=True)
    tag = urllib.parse.unquote(url.rstrip('/').split('/')[-1])
    match = re.fullmatch(r'jdk-(21\.\d+\.\d+(?:\.\d+)?)\+(\d+)', tag)
    if not match:
        raise RuntimeError('Unexpected official JDK release tag')
    version, build = match.groups()
    name = f'OpenJDK21U-jdk_x64_linux_hotspot_{version}_{build}.tar.gz'
    base = f'https://github.com/adoptium/temurin21-binaries/releases/download/{urllib.parse.quote(tag, safe="")}/{name}'
    archive = cache / name
    checksum = cache / f'{name}.sha256.txt'
    fetch(base + '.sha256.txt', checksum)
    fetch(base, archive)
    verify(archive, checksum.read_text().split()[0], 'sha256')
    with tarfile.open(archive) as bundle:
        root = bundle.getnames()[0].split('/')[0]
        bundle.extractall(cache, filter='data')
    (cache / root).rename(jdk)
    print('Verified and installed JDK', tag, flush=True)

manager = sdk / 'cmdline-tools/latest/bin/sdkmanager'
if not manager.exists():
    metadata = cache / 'android-repository.xml'
    fetch('https://dl.google.com/android/repository/repository2-3.xml', metadata)
    root = ET.parse(metadata).getroot()
    package = next(p for p in root.iter() if p.tag.endswith('remotePackage') and p.get('path') == 'cmdline-tools;latest')
    values = None
    for archive in package.iter():
        if archive.tag.endswith('archive'):
            data = {e.tag.split('}')[-1]: e.text for e in archive.iter()}
            if data.get('host-os') == 'linux':
                values = data
                break
    if not values or not re.fullmatch(r'commandlinetools-linux-[\w.]+\.zip', values['url']):
        raise RuntimeError('Unexpected Android tools metadata')
    archive = cache / values['url']
    fetch('https://dl.google.com/android/repository/' + values['url'], archive)
    verify(archive, values['checksum'], 'sha1')
    unpack = cache / 'android-tools-unpack'
    with zipfile.ZipFile(archive) as bundle:
        bundle.extractall(unpack)
    manager.parent.parent.mkdir(parents=True, exist_ok=True)
    (unpack / 'cmdline-tools').rename(manager.parent.parent / 'extracted')
    for item in (manager.parent.parent / 'extracted').iterdir():
        item.rename(manager.parent.parent / item.name)
    (manager.parent.parent / 'extracted').rmdir()
    for executable in manager.parent.iterdir():
        executable.chmod(executable.stat().st_mode | 0o111)
    print('Verified and installed Android command-line tools', flush=True)

# Java does not inherit HTTP(S)_PROXY automatically. Keep proxy configuration local.
proxy = urllib.parse.urlsplit(os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy') or '')
if proxy.hostname and not proxy.username:
    properties = cache / 'gradle/gradle.properties'
    properties.parent.mkdir(parents=True, exist_ok=True)
    if not properties.exists():
        properties.write_text('\n'.join(f'systemProp.{scheme}.proxyHost={proxy.hostname}\nsystemProp.{scheme}.proxyPort={proxy.port or 80}\nsystemProp.{scheme}.nonProxyHosts=localhost|127.*' for scheme in ('http', 'https')) + '\n')
        properties.chmod(0o600)
certificate = os.environ.get('CODEX_PROXY_CERT')
if certificate and Path(certificate).is_file():
    keytool = str(jdk / 'bin/keytool')
    truststore = str(jdk / 'lib/security/cacerts')
    existing = subprocess.run([keytool, '-list', '-alias', 'cloud-environment-proxy', '-keystore', truststore, '-storepass', 'changeit'], capture_output=True)
    if existing.returncode:
        subprocess.run([keytool, '-importcert', '-noprompt', '-alias', 'cloud-environment-proxy', '-file', certificate, '-keystore', truststore, '-storepass', 'changeit'], check=True, capture_output=True)

environment = {**os.environ, 'JAVA_HOME': str(jdk), 'ANDROID_HOME': str(sdk), 'ANDROID_SDK_ROOT': str(sdk), 'GRADLE_USER_HOME': str(cache / 'gradle'), 'ANDROID_USER_HOME': str(cache / 'android-user'), 'XDG_DATA_HOME': str(cache / 'data'), 'XDG_CACHE_HOME': str(cache / 'cache'), 'XDG_CONFIG_HOME': str(cache / 'config')}
log = cache / 'sdk-install.log'
with log.open('w') as output:
    result = subprocess.run([str(manager), f'--sdk_root={sdk}', '--licenses'], input='y\n' * 100, text=True, env=environment, stdout=output, stderr=subprocess.STDOUT)
    if result.returncode:
        raise RuntimeError(f'Android license setup failed; see {log}')
    result = subprocess.run([str(manager), f'--sdk_root={sdk}', 'platform-tools', 'platforms;android-36', 'build-tools;35.0.0', 'build-tools;36.0.0'], env=environment, stdout=output, stderr=subprocess.STDOUT)
    if result.returncode:
        raise RuntimeError(f'Android SDK installation failed; see {log}')
(cache / 'environment.json').write_text(json.dumps({key: environment[key] for key in ['JAVA_HOME', 'ANDROID_HOME', 'ANDROID_SDK_ROOT', 'GRADLE_USER_HOME', 'ANDROID_USER_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME']}, indent=2))
print('Android SDK 36 and JDK 21 are ready. Build with: npm run mobile:android', flush=True)
